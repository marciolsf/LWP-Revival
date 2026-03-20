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
const { zipAndSend, sendZippedFolder } = require('./Functions');
const { updateNews } = require('./NewsBuilder');


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
    `Body: ${JSON.stringify(req.rawBody)}`,
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
  fs.readFile(path.join(CHANNELDIR, 'channel_list.xml'), (err, data) => {
    if (err) return res.sendStatus(500);
    //data = data.replace(/www\.k2\.cbe-world\.com/g, BASE_DOMAIN);
    //console.log(`[URLMAN] Replaced www.k2.cbe-world.com with ${BASE_DOMAIN} in channel_list.xml`);
    //data = data.replace(/www\.cbe-world\.com/g, CBE_DOMAIN);
    //console.log(`[URLMAN] Replaced www.cbe-world.com with ${CBE_DOMAIN} in channel_list.xml`);
    res.send(data);
  });
});

/* =========================
   Channel Data
   ========================= */

// LIVE Channel
app.get('/acfs/noauth/lwp/FLWP00001/:region/:subregion/city_info.xml.zip', async (req, res) => {
  res.type('text/xml');
  console.log("[CHANNEL] Live Channel city info requested!");

  const xmlPath = path.join(CHANNELDIR, 'FLWP00001', 'city_info.xml');
  try {
    await updateNews(xmlPath);
    zipAndSend("city_info.xml", res, xmlPath);
  } catch (err) {
    console.error("[FATAL ERROR]", err);
    res.sendStatus(500);
  }
});

app.get('/acfs/noauth/lwp/FLWP00001/:region/:subregion/city_diff.xml.zip', async (req, res) => {
    res.type('text/xml');
    console.log("[CHANNEL] Live Channel city diff requested!");

    const xmlPath = path.join(CHANNELDIR, 'FLWP00001', 'city_diff.xml');
    try {
        await updateNews(xmlPath);
        zipAndSend("city_diff.xml", res, xmlPath);
    } catch (err) {
        console.error("[FATAL ERROR]", err);
        res.sendStatus(500);
    }
});

app.get('/acfs/noauth/lwp/FLWP00001/cloud.xml.zip', (req, res) => {
    res.type('text/xml');
    console.log("[CHANNEL] Live Channel cloud info requested!");
    const xmlPath = path.join(CHANNELDIR, 'FLWP00001', 'cloud.xml');
    zipAndSend("cloud.xml", res, xmlPath);
    /*try {
        let xmlContent = fs.readFileSync(xmlPath, 'utf8');
        //xmlContent = xmlContent.replace(/www\.k2\.cbe-world\.com/g, BASE_DOMAIN);
        //console.log(`[URLMAN] Replaced www.k2.cbe-world.com with ${BASE_DOMAIN} in FLWP00001 cloud.xml`);
        //xmlContent = xmlContent.replace(/www\.cbe-world\.com/g, CBE_DOMAIN);
        //console.log(`[URLMAN] Replaced www.cbe-world.com with ${CBE_DOMAIN} in FLWP00001 cloud.xml`);
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
    }*/
});

app.get('/acfs/noauth/lwp/FLWP00001/cloud.jpg', (req, res) => {
  res.type('image/jpeg');
  console.log("[CHANNEL] Live Channel cloud sent!!!!");
  /*  console.log("[CLOUD] Fetching 2K Matteason satellite overlay...");
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
    }*/
  fs.readFile(
    path.join(CHANNELDIR, 'FLWP00001', 'cloud.jpg'),
    (err, data) => {
      if (err) return res.sendStatus(500);
      res.send(data);
    }
  );
});

// World Heritage channel
app.get('/acfs/noauth/lwp/FUNVL0001/info/:region/:subregion/globe.xml.zip', (req, res) => {
  res.type('text/xml');
  console.log("[CHANNEL] World Heritage globe info requested!");

  const xmlPath = path.join(CHANNELDIR, 'FUNVL0001/globe/globe.xml')
  zipAndSend("globe.xml", res, xmlPath);

  /*try {
    let xmlContent = fs.readFileSync(xmlPath, 'utf8');
    //xmlContent = xmlContent.replace(/www\.k2\.cbe-world\.com/g, BASE_DOMAIN);
    //console.log(`[URLMAN] Replaced www.k2.cbe-world.com with ${BASE_DOMAIN} in FUNVL0001 globe.xml`);
    //xmlContent = xmlContent.replace(/www\.cbe-world\.com/g, CBE_DOMAIN);
    //console.log(`[URLMAN] Replaced www.cbe-world.com with ${CBE_DOMAIN} in FUNVL0001 globe.xml`);

    const zip = new AdmZip();
    zip.addFile("globe.xml", Buffer.from(xmlContent, "utf8"));
    res.set({'Content-Type': 'application/zip'}).send(zip.toBuffer());
  } catch (err) {
    console.error("[GLOBE ERROR]", err);
    res.sendStatus(500);
  }*/
});

app.get('/acfs/noauth/lwp/FUNVL0001/contentPubDate.xml', (req, res) => {
  res.type('text/xml');
  console.log("[CHANNEL] World Heritage contentPubDate requested!")
  fs.readFile(
    path.join(CHANNELDIR, 'FUNVL0001', 'contentPubDate.xml'),
    (err, data) => {
      if (err) return res.sendStatus(500);
      //data = data.replace(/www\.cbe-world\.com/g, CBE_DOMAIN);
      //console.log(`[URLMAN] Replaced www.cbe-world.com with ${CBE_DOMAIN} in FUNVL0001 contentPubDate.xml`);
      res.send(data);
    }
  );
});

app.get('/acfs/noauth/lwp/FUNVL0001/FUNVL0001.zip', (req, res) => {
  console.log("[CHANNEL] World Heritage zip update!");
  const folderPath = path.join(PLUGINDIR, 'FUNVL0001');
  sendZippedFolder("FUNVL0001", res, folderPath);
});

// Alpha Clock channel
app.get('/tcfs/lwp/FALPL0001/info/:region/:subregion/globe.xml.zip', (req, res) => {
  res.type('text/xml');
  console.log("[CHANNEL] Alpha Clock globe info requested!");

  const xmlPath = path.join(CHANNELDIR, 'FALPL0001/globe/globe.xml')
  zipAndSend("globe.xml", res, xmlPath);

  /*try {
    let xmlContent = fs.readFileSync(xmlPath, 'utf8');
    //xmlContent = xmlContent.replace(/www\.k2\.cbe-world\.com/g, BASE_DOMAIN);
    //console.log(`[URLMAN] Replaced www.k2.cbe-world.com with ${BASE_DOMAIN} in FALPL0001 globe.xml`);
    //xmlContent = xmlContent.replace(/www\.cbe-world\.com/g, CBE_DOMAIN);
    //console.log(`[URLMAN] Replaced www.cbe-world.com with ${CBE_DOMAIN} in FALPL0001 globe.xml`);

    const zip = new AdmZip();
    zip.addFile("globe.xml", Buffer.from(xmlContent, "utf8"));
    res.set({'Content-Type': 'application/zip'}).send(zip.toBuffer());
  } catch (err) {
    console.error("[GLOBE ERROR]", err);
    res.sendStatus(500);
  }*/
});

app.get('/tcfs/lwp/FALPL0001/contentPubDate.xml', (req, res) => {
  res.type('text/xml');
  console.log("[CHANNEL] Alpha Clock contentPubDate!")
  fs.readFile(
    path.join(CHANNELDIR, 'FALPL0001', 'contentPubDate.xml'),
    (err, data) => {
      if (err) return res.sendStatus(500);
      //data = data.replace(/www\.cbe-world\.com/g, CBE_DOMAIN);
      //console.log(`[URLMAN] Replaced www.cbe-world.com with ${CBE_DOMAIN} in FALPL0001 contentPubDate.xml`);
      res.send(data);
    }
  );
})

app.get('/tcfs/lwp/FALPL0001/FALPL0001.zip', (req, res) => {
  console.log("[CHANNEL] Alpha Clock update zip!");
  const folderPath = path.join(PLUGINDIR, 'FALPL0001');
  sendZippedFolder("FALPL0001", res, folderPath);
});


/* =========================
   AAS CLIENT
========================= */
app.get('/aas/client', (req, res) => {
  console.log("[AAS] GET", req.query.cmd || "no-cmd", req.originalUrl);
  const nonce='8f3c9d8a4b1e2f7c1a5d0b7e9c0a6f2d'
  
  if (req.query.cmd === 'challenge') {
    res.status(200);
    res.set('Content-Type', 'application/x-np-ticket');
    res.send(`nonce=${nonce}`);
    return;
  }
  else if (req.query.cmd === 'logout') {
    console.log("[AAS] logout");
    res.sendStatus(200);
    return;
  }

  res.sendStatus(400);
});

app.post('/aas/client', (req, res) => {
  console.log("[AAS] POST", req.query.cmd || "no-cmd", req.originalUrl);
  const sid = req.query.JSESSIONID || jsid;

  if (req.query.cmd == 'login' || req.query.cmd == 'createlogin') {
    res.set('Date', new Date().toUTCString());
    res.set('Content-Type', 'application/x-np-ticket');
    res.set('Set-Cookie', `JSESSIONID=${sid}; Path=/;`);
    res.set('recommended-timeout', '300');
    return res.sendStatus(200);
  }
  else if (req.query.cmd == 'createaccount') {
    //res.setHeader('Content-Type', 'application/xml');
    return res.sendStatus(200);
  }
  else if (req.query.cmd == 'createloginverify') {
    res.set('Set-Cookie', `JSESSIONID=${sid}; Path=/;`);
    res.set('recommended-timeout', '300');
    res.set('entitlement-expire-time', String(Math.floor(Date.now()/1000) + 3600));

    return res.sendStatus(200);
  }
  else if (req.query.cmd == 'updatesession') {
    res.set('recommended-timeout', '300');
    return res.sendStatus(200);
  }
});

/* =========================
   CPS CLIENT
========================= */
app.post('/contribution/client', (req, res) => {
  console.log("[CPS] POST", req.query.cmd || "no-cmd", req.originalUrl);

  if (req.query.cmd == 'cs_getsaveuid') {
    res.set('Content-Type', 'application/x-cs-request-param');
    return res.send('save-uid=123123123123\r\nrecommended-access-interval=300');
  }
  else if (req.query.cmd == 'cs_inquirecontribution') {
    res.set('Content-Type', 'application/x-cs-request-param');
    return res.send('abs-value=123\r\nrecommended-access-interval=300');
  } else if (req.query.cmd == 'cs_uploadcontribution') {
    res.set('Content-Type', 'application/x-cs-request-param');
    return res.send('recommended-access-interval=300');
  }
});

/* =========================
   STATS / WATCHER
========================= */
app.get('/stats/watcher', (req, res) => {
  console.log("[WSS] GET", req.query)
  res.type('application/x-cw-watcher-status');
  // c ug u g

  if (req.query.cmd == 'c') {
    console.log("[WSS] Sending hardcoded channel list");

    //const reply = Buffer.alloc(16 + (count * 8));
    const reply = fs.readFileSync(CHANNELDIR + '/wss/testwss_c.dat');
    res.send(reply);
  }

  if(req.query.cmd == 'g') {
    console.log("[WSS] Sending hardcoded channel versions");

    const reply = fs.readFileSync(CHANNELDIR + "/wss/testwss_g.dat");
    res.end(reply);
  }
  
  //res.sendStatus(400);
});

app.post('/stats/watcher', (req, res) => {
  console.log("[WSS] POST", req.query);
  res.type('application/x-cw-watcher-status');

  if(req.query.cmd == 'ug') {

    const b = req.rawBody ?? Buffer.alloc(0);

    console.log('ug bytes:', b.length);
    console.log('ug hex :', b.toString('hex').match(/.{1,2}/g)?.join(' ') ?? '');

    if (b.length >= 12) {
      console.log('u16[0]=', b.readUInt16BE(0).toString(16)); // should be 0x000c
      console.log('entrySize=', b.readUInt16BE(6));            // should be 8
      console.log('count=', b.readUInt16BE(8));
    }

    console.log("[WSS] Sending placeholder update packet");

    const reply = fs.readFileSync(CHANNELDIR + "/wss/testwss_c.dat");
    res.end(reply);
  }
});

/* =========================
   LOCATION STATS
========================= */
app.get('/stats/location', (req, res) => {
  console.log("[LOCSTATS] GET", req.query)
  // c kg r 

    if (req.query.cmd == 'c' || req.query.cmd == 'kg') {
    if (req.query.cmd == 'c') {
      console.log("[LOCSTATS] Create Session & sending locstats");
    } else {
      console.log("[LOCSTATS] Sending locstats");
    }

    //const reply = Buffer.alloc(16 + (count * 8));
    const reply = fs.readFileSync(CHANNELDIR + '/locstats.dat');
    res.send(reply.slice(0x20));
  }

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
  console.log(req.method);
  res.status(200).send('boo');
});

/* =========================
   START SERVER
========================= */
console.log('Life with PlayStation-Revival 0.4.2');
https.createServer(options, app).listen(443, HOST, () => {
  console.log(`Listening HTTPS on ${HOST}:443`);
});
http.createServer(app).listen(80, HOST, () => {
  console.log(`Listening HTTP on: ${HOST}:80`);
});
