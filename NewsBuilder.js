const fs = require('fs');
const RSSParser = require('rss-parser');
const cityMap = require('./CityMap');
const getWeather = require('./Weather');

const parser = new RSSParser({
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
  }
});

async function updateNews(xmlPath) {
  try {
    let xmlContent = fs.readFileSync(xmlPath, 'utf8');
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

    fs.writeFileSync(xmlPath, xmlContent, 'utf8');
  } catch (err) {
    console.error("[FATAL ERROR]", err);
    throw err;
  }
}

module.exports = { updateNews };
