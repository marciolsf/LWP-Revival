const https = require('https');
const http = require('http');
const express = require('express');
const path = require('path');
const fs = require('fs');
const AdmZip = require('adm-zip');
const axios = require('axios');
const sharp = require('sharp');
const RSSParser = require('rss-parser');

/* =========================
   External files
========================= */
const cityMap = require('./CityMap');
const getWeather = require('./Weather');
const { zipAndSend } = require('./Functions');


const parser = new RSSParser({
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
  }
});


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

/*
Enter your custom server URLs here! This is needed to replace the hardcoded URLs in the XML files that the PS3 fetches, 
so that they point to your server instead of the original CBE servers.

If you have a domain, use it here (with www if you use it). If you are hosting locally or using a tunneling service like ngrok, 
put that URL here instead (without http/https).

BASE_DOMAIN is used for the channel list and other general URLs, while CBE_DOMAIN is specifically for the weather icons and news links in the LIVE channel. You can set them to the same value if you want.
BASE_DOMAIN used to be www.k2.cbe-world.com in the original XMLs, 
and CBE_DOMAIN used to be www.cbe-world.com. 
So if you want to find and replace in the XMLs, those are the original domains you should look for.


*/
const BASE_DOMAIN = 'www.k2.cbe-world.com';
const CBE_DOMAIN = 'www.cbe-world.com';

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
  fs.readFile(path.join(CHANNELDIR, 'channel_list.xml'), 'utf8', (err, data) => {
    if (err) return res.sendStatus(500);
    data = data.replace(/www\.k2\.cbe-world\.com/g, BASE_DOMAIN);
    console.log(`[URLMAN] Replaced www.k2.cbe-world.com with ${BASE_DOMAIN} in channel_list.xml`);
    data = data.replace(/www\.cbe-world\.com/g, CBE_DOMAIN);
    console.log(`[URLMAN] Replaced www.cbe-world.com with ${CBE_DOMAIN} in channel_list.xml`);
    res.send(data);
  });
});

/* =========================
   Channel Data
   ========================= */

// LIVE Channel
app.get('/acfs/noauth/lwp/FLWP00001/:region/:subregion/city_info.xml.zip', (req, res) => {
  console.log("[CHANNEL] Live Channel city info requested!");

  const xmlPath = path.join(CHANNELDIR, 'FLWP00001', 'city_info.xml');

  try {
    let xmlContent = fs.readFileSync(xmlPath, 'utf8');
    xmlContent = xmlContent.replace(/www\.k2\.cbe-world\.com/g, BASE_DOMAIN);
    console.log(`[URLMAN] Replaced www.k2.cbe-world.com with ${BASE_DOMAIN} in FLWP00001 city_info.xml`);
    xmlContent = xmlContent.replace(/www\.cbe-world\.com/g, CBE_DOMAIN);
    console.log(`[URLMAN] Replaced www.cbe-world.com with ${CBE_DOMAIN} in FLWP00001 city_info.xml`);

    const zip = new AdmZip();
    zip.addFile("city_info.xml", Buffer.from(xmlContent, "utf8"));
    res.set({'Content-Type': 'application/zip'}).send(zip.toBuffer());
  } catch (err) {
    console.error("[CITY_INFO ERROR]", err);
    res.sendStatus(500);
  }
});

// TOP OF YOUR FILE: Make sure your parser is configured like this!

app.get('/acfs/noauth/lwp/FLWP00001/:region/:subregion/city_diff.xml.zip', async (req, res) => {
    console.log("[XML] city_diff requested. Injecting News & Weather...");
    const xmlPath = path.join(CHANNELDIR, 'FLWP00001', 'city_diff.xml');

    try {
        let xmlContent = fs.readFileSync(xmlPath, 'utf8');
        xmlContent = xmlContent.replace(/www\.k2\.cbe-world\.com/g, BASE_DOMAIN);
        console.log(`[URLMAN] Replaced www.k2.cbe-world.com with ${BASE_DOMAIN} in FLWP00001 city_diff.xml`);
        xmlContent = xmlContent.replace(/www\.cbe-world\.com/g, CBE_DOMAIN);
        console.log(`[URLMAN] Replaced www.cbe-world.com with ${CBE_DOMAIN} in FLWP00001 city_diff.xml`);
        const v = Date.now(); 

        xmlContent = xmlContent.replace(/<ttl>\d+<\/ttl>/g, `<ttl>15</ttl>`);

        for (const city of cityMap) {
            try {
                // A. WEATHER
                const weather = await getWeather(city.accKey);
                
                // B. NEWS
                let headlines = [];
                try {
                    const rssUrl = `http://localhost:1200/apnews/topics/${encodeURIComponent(city.name)}`;
                    const feed = await parser.parseURL(rssUrl);
                    headlines = feed.items.slice(0, 4);
                } catch (e) {
                    console.error(`[NEWS ERR] Feed failed for ${city.name}: ${e.message}`);
                    // Fallback headlines
                    headlines = [{ title: `Checking ${city.name} News...`, link: "https://apnews.com" }];
                }

                // C. INJECT INTO XML
                const cityBlockRegex = new RegExp(`(<live:cityId>${city.id}<\/live:cityId>[\\s\\S]*?)(?=<live:cityId>|$)`, 'g');

                xmlContent = xmlContent.replace(cityBlockRegex, (cityBlock) => {
                    const newGuid = `${city.file.split('.')[0]}-${v}`;
                    let updated = cityBlock.replace(/guid=".*?"/g, `guid="${newGuid}"`);
                    updated = updated.replace(new RegExp(city.file, 'g'), `${v}/${city.file}`);

                    // Weather
                    updated = updated.replace(/pic="\d+"/, `pic="${weather.icon}"`);
                    updated = updated.replace(/(pattern="celsius">).*?(<\/live:subname>)/, `$1${weather.c}℃$2`);
                    updated = updated.replace(/(pattern="fahrenheit">).*?(<\/live:subname>)/, `$1${weather.f}℉$2`);

                    // News
                    let newsIndex = 0;
                    updated = updated.replace(/<live:item.*?>([\s\S]*?)<\/live:item>/g, (match) => {
                        const newsItem = headlines[newsIndex] || { title: "AP World News", link: "https://apnews.com" };
                        newsIndex++;

                        const cleanHeadline = newsItem.title
                            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');

                        let tag = match.replace(/>.*?</, `>${cleanHeadline}<`);
                        if (newsItem.link) tag = tag.replace(/url=".*?"/, `url="${newsItem.link}"`); // adds News URL to the headline
                        return tag;
                    });

                    return updated;
                });

                console.log(`[OK] ${city.name} updated.`);
            } catch (cityErr) {
                console.error(`[SKIP] ${city.name} failed:`, cityErr.message);
            }
        }

        const zip = new AdmZip();
        zip.addFile("city_diff.xml", Buffer.from(xmlContent, "utf8"));
        res.set({'Content-Type': 'application/zip', 'Cache-Control': 'no-store'}).send(zip.toBuffer());

    } catch (err) {
        console.error("[FATAL ERROR]", err);
        res.sendStatus(500);
    }
});

app.get('/acfs/noauth/lwp/FLWP00001/cloud.xml.zip', (req, res) => {
    console.log("[CHANNEL] Injecting LIVE timestamp into cloud.xml...");
    const xmlPath = path.join(CHANNELDIR, 'FLWP00001', 'cloud.xml');

    try {
        let xmlContent = fs.readFileSync(xmlPath, 'utf8');
        xmlContent = xmlContent.replace(/www\.k2\.cbe-world\.com/g, BASE_DOMAIN);
        console.log(`[URLMAN] Replaced www.k2.cbe-world.com with ${BASE_DOMAIN} in FLWP00001 cloud.xml`);
        xmlContent = xmlContent.replace(/www\.cbe-world\.com/g, CBE_DOMAIN);
        console.log(`[URLMAN] Replaced www.cbe-world.com with ${CBE_DOMAIN} in FLWP00001 cloud.xml`);
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
  console.log("[CHANNEL] World Heritage globe info requested!");

  const xmlPath = path.join(CHANNELDIR, 'FUNVL0001/globe/globe.xml');

  try {
    let xmlContent = fs.readFileSync(xmlPath, 'utf8');
    xmlContent = xmlContent.replace(/www\.k2\.cbe-world\.com/g, BASE_DOMAIN);
    console.log(`[URLMAN] Replaced www.k2.cbe-world.com with ${BASE_DOMAIN} in FUNVL0001 globe.xml`);
    xmlContent = xmlContent.replace(/www\.cbe-world\.com/g, CBE_DOMAIN);
    console.log(`[URLMAN] Replaced www.cbe-world.com with ${CBE_DOMAIN} in FUNVL0001 globe.xml`);

    const zip = new AdmZip();
    zip.addFile("globe.xml", Buffer.from(xmlContent, "utf8"));
    res.set({'Content-Type': 'application/zip'}).send(zip.toBuffer());
  } catch (err) {
    console.error("[GLOBE ERROR]", err);
    res.sendStatus(500);
  }
});

app.get('/acfs/noauth/lwp/FUNVL0001/contentPubDate.xml', (req, res) => {
  res.type('text/xml');
  console.log("[CHANNEL] World Heritage contentPubDate requested!")
  fs.readFile(
    path.join(CHANNELDIR, 'FUNVL0001', 'contentPubDate.xml'),
    'utf8',
    (err, data) => {
      if (err) return res.sendStatus(500);
      data = data.replace(/www\.cbe-world\.com/g, CBE_DOMAIN);
      console.log(`[URLMAN] Replaced www.cbe-world.com with ${CBE_DOMAIN} in FUNVL0001 contentPubDate.xml`);
      res.send(data);
    }
  );
});

// Alpha Clock channel
app.get('/tcfs/lwp/FALPL0001/info/:region/:subregion/globe.xml.zip', (req, res) => {
  console.log("[CHANNEL] Alpha Clock globe info requested!");

  const xmlPath = path.join(CHANNELDIR, 'FALPL0001/globe/globe.xml');

  try {
    let xmlContent = fs.readFileSync(xmlPath, 'utf8');
    xmlContent = xmlContent.replace(/www\.k2\.cbe-world\.com/g, BASE_DOMAIN);
    console.log(`[URLMAN] Replaced www.k2.cbe-world.com with ${BASE_DOMAIN} in FALPL0001 globe.xml`);
    xmlContent = xmlContent.replace(/www\.cbe-world\.com/g, CBE_DOMAIN);
    console.log(`[URLMAN] Replaced www.cbe-world.com with ${CBE_DOMAIN} in FALPL0001 globe.xml`);

    const zip = new AdmZip();
    zip.addFile("globe.xml", Buffer.from(xmlContent, "utf8"));
    res.set({'Content-Type': 'application/zip'}).send(zip.toBuffer());
  } catch (err) {
    console.error("[GLOBE ERROR]", err);
    res.sendStatus(500);
  }
});

app.get('/tcfs/lwp/FALPL0001/contentPubDate.xml', (req, res) => {
  res.type('text/xml');
  console.log("[ALPHACLK] contentPubDate!")
  fs.readFile(
    path.join(CHANNELDIR, 'FALPL0001', 'contentPubDate.xml'),
    'utf8',
    (err, data) => {
      if (err) return res.sendStatus(500);
      data = data.replace(/www\.cbe-world\.com/g, CBE_DOMAIN);
      console.log(`[URLMAN] Replaced www.cbe-world.com with ${CBE_DOMAIN} in FALPL0001 contentPubDate.xml`);
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
      'utf8',
      (err, data) => {
        if (err) return res.sendStatus(500);
        data = data.replace(/www\.cbe-world\.com/g, CBE_DOMAIN);
        console.log(`[URLMAN] Replaced www.cbe-world.com with ${CBE_DOMAIN} in unitedvillage default_city_info.xml`);
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
   FALLBACKS (LAST)
========================= */
app.all('*any', (req, res) => {
  console.log("unk! " + req.originalUrl);
  res.status(200).send('boo');
});

/* =========================
   START SERVER
========================= */
console.log('Life with PlayStation-Revival 0.3');
https.createServer(options, app).listen(443, HOST, () => {
  console.log(`Listening HTTPS on ${HOST}:443`);
});
http.createServer(app).listen(80, HOST, () => {
  console.log(`Listening HTTP on: ${HOST}:80`);
});
