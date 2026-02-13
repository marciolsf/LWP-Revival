const https = require('https');
const http = require('http');
const express = require('express');
const path = require('path');
const fs = require('fs');
const AdmZip = require('adm-zip');
const axios = require('axios');
const sharp = require('sharp');
const RSS_PARSER = require('rss-parser');
const parser = new RSS_PARSER();
const cityMap = [
  { 
    name: "Tokyo,JP",  // This is how you add a city (add in city diff aswell!)
    id: "JAXX0085",  // Important ID so the dynamic code works, has to match city diff
    camUrl: 'http://182.171.234.126/SnapshotJPEG?Resolution=640x480', // your URL for the MJEPG cam source. Enter a "snapshot" or "image" link, NOT the mjepg stream
    file: 'tokyo.jpg' // this is how the camURl will be called. You need to fix this and upper line on city diff aswell
  },
  { 
    name: "Berlin,DE", 
    id: "GMXX0007", 
    camUrl: 'http://93.241.200.98:84/jpg/1/image.jpg',
    file: 'berlin.jpg' 
  },
  {
	name: "Paris,FR", 
    id: "FRXX0076", 
    camUrl: 'http://145.238.185.10/jpg/1/image.jpg', 
    file: 'paris.jpg' 
  },
  {
	name: "London,GB", 
    id: "UKXX0085", 
    camUrl: 'http://213.123.193.142/jpg/1/image.jpg', 
    file: 'london.jpg' 
  },
  { 
    name: "Delhi,IN", 
    id: "INXX0038", 
    camUrl: 'http://61.246.194.45/cgi-bin/viewer/video.jpg', 
    file: 'delhi.jpg' 
  }
];

const options = {
  key: fs.readFileSync('./key.pem'),
  cert: fs.readFileSync('./cert.pem'),

  minVersion: 'TLSv1',
  maxVersion: 'TLSv1.2',

  ciphers: 'ALL',
  honorCipherOrder: false,
};

const app = express();
const PORT = 443;
const HOST = '0.0.0.0';

const PLUGINDIR = path.join(__dirname, 'plugins');
const CHANNELDIR = path.join(__dirname, 'channel_dir');
const WEBSITEDIR = path.join(__dirname, 'websites');

const jsid = 'ff80c0a6fc0307efe';

app.use((req, res, next) => {
  const logEntry = [
    '==============================',
    'INCOMING REQUEST',
    `Time: ${new Date().toISOString()}`,
    `IP: ${req.ip}`,
    `Method: ${req.method}`,
    `URL: ${req.originalUrl}`,
    `Path: ${req.path}`,
    `Query: ${JSON.stringify(req.query)}`,
    `Headers: ${JSON.stringify(req.headers)}`,
    `Body: ${JSON.stringify(req.body)}`,
    '------------------------------',
    '\n'
  ].join('\n');

  fs.appendFile(path.join(__dirname, 'log.txt'), logEntry, (err) => {
    if (err) console.error('Error writing to log.txt:', err);
  });

  next();
});

/* =========================
   Middleware
========================= */
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

function zipAndSend(fileName, res, filePath) {
    if (!fs.existsSync(filePath)) {
        console.error(`[ZIP] File not found: ${filePath}`);
        return res.sendStatus(404);
    }

    try {
        const zip = new AdmZip();
        const outZipName = fileName + ".zip";

        // Add the file to the zip root
        zip.addLocalFile(filePath, '');

        const zipBuffer = zip.toBuffer();

        console.log(`[ZIP] Compressing ${filePath} -> ${outZipName}`);

        res.set({
            'Content-Type': 'application/zip',
            'Content-Disposition': `attachment; filename="${outZipName}"`,
            'Content-Length': zipBuffer.length
        });

        res.send(zipBuffer);
    } catch (err) {
        console.error(`[ZIP] Error processing ${filePath}:`, err);
        res.sendStatus(500);
    }
}

// Hopeless attempts to tell the PS3 "dont save the image plsss"
app.use((req, res, next) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
    res.set('Surrogate-Control', 'no-store');
    next();
});

// Example Camera Route
app.get('/api/camera/:cityId', async (req, res) => {
    const imgBuffer = await fetchFreshCam(req.params.cityId);
    
    // Force the content type so the PS3 knows it's an image
    res.type('image/jpeg'); 
    res.send(imgBuffer);
});

/* =========================
   Static Files
========================= */
//app.use('/data/plugins', express.static(PLUGINDIR));
app.use('/websites', express.static(WEBSITEDIR));

/* =========================
   Channel Lists
========================= */
app.get('/data/plugins/live/live.xml', (req, res) => {
  res.type('text/xml');
  fs.readFile(path.join(PLUGINDIR, 'live', 'live.xml', 'en'), (err, data) => {
    if (err) return res.sendStatus(500);
    res.send(data);
  });
});

app.get(['/lwp/info/:region/:subregion/channel_list.xml', '/acfs/lwp/info/:region/:subregion/channel_list.xml'], (req, res) => {
  res.type('text/xml');
  console.log("[CHANNELMAN] Got channel request! sending channel_list.xml");
  fs.readFile(path.join(CHANNELDIR, 'channel_list.xml'), (err, data) => {
    if (err) return res.sendStatus(500);
    res.send(data);
  });
});

/* =========================
   Channel Data
   ========================= */

// LIVE Channel
app.get('/acfs/noauth/lwp/FLWP00001/:region/:subregion/city_info.xml.zip', (req, res) => {
  res.type('text/xml');
  console.log("[CHANNEL] Live Channel city info requested!");

  const xmlPath = path.join(CHANNELDIR, 'FLWP00001', 'city_info.xml');
  zipAndSend("city_info.xml", res, xmlPath);
});

app.get('/acfs/noauth/lwp/FLWP00001/:region/:subregion/city_diff.xml.zip', async (req, res) => {
    console.log("[XML] city_diff requested. Starting injection...");
    const xmlPath = path.join(CHANNELDIR, 'FLWP00001', 'city_diff.xml');
    const blacklist = ["valentine", "michelin", "best", "ideas", "deals", "guide", "gift", "collectibles"]; // Blacklist spaggy lifestyle "news"

    try {
        let xmlContent = fs.readFileSync(xmlPath, 'utf8');
        const v = Date.now(); // The Magic Number that lets us bypass the cache

        // 1. After how many mins should the city diff change? (Weather, News, Cams are all dependent on this)
        xmlContent = xmlContent.replace(/<ttl>\d+<\/ttl>/g, `<ttl>15</ttl>`);

        for (const city of cityMap) {
            try {
                // A. GATHER DATA
                const weather = await getWeather(city.name);
                const cityNameOnly = city.name.split(',')[0];
                const feed = await parser.parseURL(`https://news.google.com/rss/search?q=${encodeURIComponent(cityNameOnly + ' news')}&hl=en-US&gl=US&ceid=US:en`);
                const headlines = feed.items.slice(0, 4);

                // B. ISOLATED REPLACEMENT
                const cityBlockRegex = new RegExp(`(<live:cityId>${city.id}<\/live:cityId>[\\s\\S]*?)(?=<live:cityId>|$)`, 'g');

                xmlContent = xmlContent.replace(cityBlockRegex, (cityBlock) => {
                    // C. GUID CHANGER (The "I am new" signal)
                    // We create a unique GUID for this specific refresh: e.g., paris-1739387000
                    const newGuid = `${city.file.split('.')[0]}-${v}`;
                    let updated = cityBlock.replace(/guid=".*?"/g, `guid="${newGuid}"`);

                    // D. CAMERA URL CHANGER (The "Fetch me" signal)
                    updated = updated.replace(new RegExp(city.file, 'g'), `${v}/${city.file}`);

                    // E. WEATHER UPDATES
                    updated = updated.replace(/pic="\d+"/, `pic="${weather.icon}"`);
                    updated = updated.replace(/(pattern="celsius">).*?(<\/live:subname>)/, `$1${weather.c}℃$2`);
                    updated = updated.replace(/(pattern="fahrenheit">).*?(<\/live:subname>)/, `$1${weather.f}℉$2`);

                    // F. NEWS UPDATES
                    let newsIndex = 0;
                    const itemRegex = /<live:item.*?>([\s\S]*?)<\/live:item>/g;
                    updated = updated.replace(itemRegex, (match) => {
                        const newsItem = headlines[newsIndex] || { title: "Global Update", link: "" };
                        newsIndex++;
                        const cleanHeadline = newsItem.title.split(' - ')[0].replace(/[<>&"']/g, '');
                        let tag = match.replace(/>.*?</, `>${cleanHeadline}<`);
                        if (newsItem.link) tag = tag.replace(/url=".*?"/, `url="${newsItem.link}"`);
                        return tag;
                    });

                    return updated;
                });

                console.log(`[LIVE] ${city.name} updated: GUID=${city.file.split('.')[0]}-${v} Weather, News and Camera Feed | Temp=${weather.c}°C`);
            } catch (cityErr) {
                console.error(`[ERR] Failed updating ${city.name}:`, cityErr.message);
            }
        }

        // Final Zip and Send
        const zip = new AdmZip();
        zip.addFile("city_diff.xml", Buffer.from(xmlContent, "utf8"));
        const zipBuffer = zip.toBuffer();

        res.set({
            'Content-Type': 'application/zip',
            'Cache-Control': 'no-store, no-cache, must-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0'
        });

        res.send(zipBuffer);
        console.log(`[XML] city_diff.xml.zip delivered. Timestamp: ${v}`);

    } catch (err) {
        console.error("[DIFF ERROR]", err);
        res.sendStatus(500);
    }
});

app.get('/acfs/noauth/lwp/FLWP00001/cloud.xml.zip', (req, res) => {
    console.log("[CHANNEL] Injecting LIVE timestamp into cloud.xml...");
    const xmlPath = path.join(CHANNELDIR, 'FLWP00001', 'cloud.xml');

    try {
        let xmlContent = fs.readFileSync(xmlPath, 'utf8');
        const now = new Date().toUTCString();
        const v = Date.now(); 

        // Update the main channel date and TTL (Check for new clouds every 180 mins) (Provider updates only after 3 hours eitherway..)
        xmlContent = xmlContent.replace(/<pubDate>.*?<\/pubDate>/g, `<pubDate>${now}</pubDate>`);
        xmlContent = xmlContent.replace(/<ttl>\d+<\/ttl>/g, `<ttl>180</ttl>`);

        // Generate a new unique GUID so the PS3 doesn't use its cache
        const newGuid = Buffer.from(`cloud-${v}`).toString('hex');
        
        xmlContent = xmlContent.replace(/guid=".*?"/g, `guid="${newGuid}"`);
        xmlContent = xmlContent.replace(/pubDate=".*?"/g, `pubDate="${now}"`);

        const zip = new AdmZip();
        zip.addFile("cloud.xml", Buffer.from(xmlContent, "utf8"));
        const zipBuffer = zip.toBuffer();

        res.set({
            'Content-Type': 'application/zip',
            'Cache-Control': 'no-cache, no-store, must-revalidate'
        });
        res.send(zipBuffer);
        console.log(`[CLOUD] cloud.xml delivered (GUID: ${newGuid.substring(0,8)}...)`);
        
    } catch (err) {
        console.error("[CLOUD XML ERROR]", err);
        res.sendStatus(500);
    }
});

app.get('/acfs/noauth/lwp/FLWP00001/cloud.jpg', async (req, res) => {
    console.log("[CLOUD] Fetching 2K Matteason satellite overlay...");
    const cloudUrl = `https://clouds.matteason.co.uk/images/2048x1024/clouds.jpg`;

    try {
        const response = await axios.get(cloudUrl, { 
            responseType: 'arraybuffer',
            timeout: 15000 
        });

        const cloudImage = await sharp(response.data)
            .jpeg({ quality: 85 })
            .toBuffer();

        res.set({
            'Content-Type': 'image/jpeg',
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0'
        });

        res.send(cloudImage);
        console.log("[CLOUD] Live satellite clouds delivered.");
    } catch (e) {
        console.error("[CLOUD ERROR] Matteason fetch failed:", e.message);
        // If internet fetch fails, try to send the local file as backup
        const fallback = path.join(CHANNELDIR, 'FLWP00001', 'cloud.jpg');
        if (fs.existsSync(fallback)) res.sendFile(fallback);
        else res.sendStatus(404);
    }
});

// World Heritage channel
app.get('/acfs/noauth/lwp/FUNVL0001/info/:region/:subregion/globe.xml.zip', (req, res) => {
  res.type('text/xml');
  console.log("[CHANNEL] World Heritage globe info requested!");

  const xmlPath = path.join(CHANNELDIR, 'FUNVL0001/globe/globe.xml')
  zipAndSend("globe.xml", res, xmlPath);
});

app.get('/acfs/noauth/lwp/FUNVL0001/contentPubDate.xml', (req, res) => {
  res.type('text/xml');
  console.log("[CHANNEL] World Heritage contentPubDate requested!")
  fs.readFile(
    path.join(CHANNELDIR, 'FUNVL0001', 'contentPubDate.xml'),
    (err, data) => {
      if (err) return res.sendStatus(500);
      res.send(data);
    }
  );
});

// Alpha Clock channel
app.get('/tcfs/lwp/FALPL0001/info/:region/:subregion/globe.xml.zip', (req, res) => {
  res.type('text/xml');
  console.log("[CHANNEL] Alpha Clock globe info requested!");

  const xmlPath = path.join(CHANNELDIR, 'FALPL0001/globe/globe.xml')
  zipAndSend("globe.xml", res, xmlPath);
});

app.get('/tcfs/lwp/FALPL0001/contentPubDate.xml', (req, res) => {
  res.type('text/xml');
  console.log("[ALPHACLK] contentPubDate!")
  fs.readFile(
    path.join(CHANNELDIR, 'FALPL0001', 'contentPubDate.xml'),
    (err, data) => {
      if (err) return res.sendStatus(500);
      res.send(data);
    }
  );
})

app.get('/lwp/united_village', (req, res) => {

});


/* =========================
   AAS CLIENT
========================= */
app.get('/aas/client', (req, res) => {
  console.log("[AAS] GET", req.query.cmd || "no-cmd", req.originalUrl);
  
  if (req.query.cmd === 'challenge') {
    res.status(200)
      .set({
        'Content-Type': 'application/x-np-ticket',
        'Connection': 'keep-alive'
      })
      .send(`nonce=aaaaa&JSESSIONID=${jsid}`);
    return;
  }
  else if (req.query.cmd === 'logout') {
    console.log("[AAS] logout");
    res.status(200).end('');
    return;
  }

  res.sendStatus(400);
});

app.post('/aas/client', (req, res) => {
  console.log("[AAS] POST", req.query.cmd || "no-cmd", req.originalUrl);

  if (req.query.cmd == 'login') {
    const sid = req.query.JSESSIONID || jsid;

    // BODY isnt needed
    const body = `JSESSIONID=${sid}&cwsessionid=${sid}&status=1`;

    res.status(200)
      .set({
        'Content-Type': 'application/x-np-ticket',
        'Connection': 'Keep-Alive',
        'Set-Cookie': `JSESSIONID=${sid}; Path=/`
      })
      .send('');
  }
  else if (req.query.cmd == 'createaccount') {
    res.setHeader('Content-Type', 'application/xml');

    /*return res.status(200).send(`<?xml version="1.0" encoding="utf-8"?>
<aas>
  <accountid>${req.query['cw-user-id'] || 'dummy'}</accountid>
  <password>${req.query['cw-passwd'] || 'dummy'}</password>
  <sessionid>${req.query['JSESSIONID'] || ''}</sessionid>
  <status>1</status>
</aas>`);*/

    return res.status(200).send('');

  }
  else if (req.query.cmd == 'updatesession') {
    return res.status(200).send('');
  }
});

/* =========================
   STATS / WATCHER
========================= */
app.get('/stats/watcher', (req, res) => {
  console.log("[WSS] GET", req.query)

  if (req.query.cmd === 'g') {
    res.status(200)
      .set({
        'Content-Type': 'application/x-cw-watcher-status',
        'Connection': 'keep-alive'
      })
      .send(
        `save-uid=${jsid}&delta-value=0&abs-value=1&country=en`
      );
    return;
  }

  if (req.query.cmd === 'c') {
    res.type('text/xml');
    fs.readFile(
      path.join(CHANNELDIR, 'unitedvillage', 'default_city_info.xml'),
      (err, data) => {
        if (err) return res.sendStatus(500);
        res.send(data);
      }
    );
    return;
  }

  res.sendStatus(400);
});

/* =========================
   LOCATION STATS
========================= */
app.get('/stats/location', (req, res) => {
  console.log("[LOCSTATS] GET", req.query)

  res.status(200)
    .set('Set-Cookie', `cwsessionid=${jsid}; Path=/`)
    .type('text/xml');

  fs.readFile(
    path.join(CHANNELDIR, 'testing', 'complete_location_list.loc'),
    (err, data) => {
      if (err) return res.sendStatus(500);
      res.send(data);
    }
  );
});

/* =========================
   TEST ZIP
========================= */
app.get('/lwp/live.zip', (req, res) => {
  console.log("[TEST] zip asked")
  fs.readFile(
    path.join(CHANNELDIR, 'live.zip'),
    (err, data) => {
      if (err) return res.sendStatus(500);
      res.send(data);
    }
  );
});
/* =========================
   LIVE CAMERA FEEDS
========================= */
app.get('/:v/:filename', async (req, res) => {
    const { filename } = req.params;
    
    // Find the city that matches the requested filename
    const city = cityMap.find(c => c.file === filename);
    
    if (!city || !city.camUrl) {
        return res.status(404).send("Camera not configured");
    }

    console.log(`[CAM] Fetching ${city.name} for PS3...`);
    
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000); // How long the server can wait for the cam to send its jpeg

    try {
        const response = await axios.get(city.camUrl, { 
            responseType: 'arraybuffer',
            signal: controller.signal
        });

        clearTimeout(timeout);

        const resizedImage = await sharp(response.data)
            .resize(240, 180) // We need to resize the image as 240x180 (what LWP only supports) is not a standard res for cameras..
            .jpeg({ quality: 80 })
            .toBuffer();

        res.set({
            'Content-Type': 'image/jpeg',
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0'
        });

        res.send(resizedImage);
        console.log(`[CAM] ${city.name} frame delivered.`);
    } catch (e) {
        clearTimeout(timeout);
        console.error(`[CAM ERROR] ${city.name} offline`);
        res.status(404).send("Offline");
    }
});
/* =========================
   WEATHER FEEDS
========================= */
async function getWeather(cityName) {
    const API_KEY = 'YOUR API LYNX'; // Please get your own API key from openweatherapp, its free!
    const url = `https://api.openweathermap.org/data/2.5/weather?q=${cityName}&units=metric&appid=${API_KEY}`; 

    try {
        const res = await axios.get(url);
        const data = res.data;
        const isDay = data.dt >= data.sys.sunrise && data.dt < data.sys.sunset;
        const code = data.weather[0].id;

        let icon = 32; 
        
        // --- Openweatherapp weather codes converted to LWP weather icons ---
        if (code === 800) icon = isDay ? 32 : 31; // isDay ? is for the icons that have a day/night variant
        else if (code === 801) icon = isDay ? 30 : 29; 
        else if (code === 802) icon = isDay ? 28 : 27;
        else if (code === 803 || code === 804) icon = 26;
        else if (code >= 200 && code < 300) icon = isDay ? 37 : 47;
        else if (code >= 300 && code < 500) icon = 9; 
        else if (code >= 500 && code < 511) icon = 11;
        else if (code === 511) icon = 7;
        else if (code >= 600 && code < 611) icon = 14;
        else if (code >= 611 && code < 700) icon = 8;
		else if (code >= 520 && code < 600) icon = 12;
		else if (code >= 600 && code < 700) icon = 14;
		
        else if ([701, 711, 721, 741].includes(code)) {
            icon = isDay ? 19 : (Math.random() > 0.5 ? 20 : 21);
        } else if (code === 781 || code === 771) {
            icon = 24; 
        }

        return {
            c: Math.round(data.main.temp),
            f: Math.round(data.main.temp * 1.8 + 32), // For the americans
            icon: icon
        };
    } catch (e) {
        return { c: 10, f: 50, icon: 45 }; // Fallback if all goes wrong :(
    }
}
/* =========================
   FALLBACKS (LAST)
========================= */
app.all('*any', (req, res) => {
  console.log("unk! " + req.originalUrl);
  res.status(200).send('boo');
});

/* =========================
   START SERVER
========================= */
console.log('Life with PlayStation Custom Server OHP');
https.createServer(options, app).listen(443, HOST, () => {
  console.log(`Listening HTTPS on ${HOST}:443`);
});
http.createServer(app).listen(80, HOST, () => {
  console.log(`Listening HTTP on: ${HOST}:80`);
});
