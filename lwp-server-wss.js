const https = require('https');
const http = require('http');
const express = require('express');
const path = require('path');
const fs = require('fs');
const AdmZip = require('adm-zip');

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

function sendZippedFolder(folderName, res, folderPath) {
    try {
        if (!fs.existsSync(folderPath)) {
            return res.status(404).send('Folder not found');
        }

        const zip = new AdmZip();
        zip.addLocalFolder(folderPath, folderName);

        const zipBuffer = zip.toBuffer();

        console.log(`[ZIP] Compressing folder ${folderPath} -> ${folderName}`);

        res.set({
            'Content-Type': 'application/zip',
            'Content-Disposition': `attachment; filename=${folderName}`,
            'Content-Length': zipBuffer.length
        });

        return res.send(zipBuffer);

    } catch (err) {
        console.error(`Error zipping folder ${folderPath}:`, err);
        return res.status(500).send('Error creating zip');
    }
}

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

app.get('/acfs/noauth/lwp/FLWP00001/:region/:subregion/city_diff.xml.zip', (req, res) => {
  res.type('text/xml');
  console.log("[CHANNEL] Live Channel city diff requested!");

  const xmlPath = path.join(CHANNELDIR, 'FLWP00001', 'city_diff.xml');
  zipAndSend("city_diff.xml", res, xmlPath);
});

app.get('/acfs/noauth/lwp/FLWP00001/cloud.xml.zip', (req, res) => {
  res.type('text/xml');
  console.log("[CHANNEL] Live Channel cloud info requested!");

  const xmlPath = path.join(CHANNELDIR, 'FLWP00001', 'cloud.xml');
  zipAndSend("cloud.xml", res, xmlPath);
});

app.get('/acfs/noauth/lwp/FLWP00001/cloud.jpg', (req, res) => {
  res.type('image/jpeg');
  console.log("[CHANNEL] Live Channel cloud sent!!!!");

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
});

app.get('/tcfs/lwp/FALPL0001/contentPubDate.xml', (req, res) => {
  res.type('text/xml');
  console.log("[CHANNEL] Alpha Clock contentPubDate!")
  fs.readFile(
    path.join(CHANNELDIR, 'FALPL0001', 'contentPubDate.xml'),
    (err, data) => {
      if (err) return res.sendStatus(500);
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
console.log('Life with PlayStation Custom Server POC');
https.createServer(options, app).listen(443, HOST, () => {
  console.log(`Listening HTTPS on ${HOST}:443`);
});
http.createServer(app).listen(80, HOST, () => {
  console.log(`Listening HTTP on: ${HOST}:80`);
});