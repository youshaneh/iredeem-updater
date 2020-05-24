import fs from 'fs';
import fetch from 'node-fetch';

async function verify(from, to){
  console.log('fetching ' + from + ' - ' + to + '...');
  let result = await fetch("https://api.asiamiles.com/afr/searchpanel/searchoptions/zh." + from + "." + to + ".rt.std.CX.json", {
    "headers": {
      "accept": "application/json, text/javascript, */*; q=0.01",
      "accept-language": "zh-TW,zh;q=0.9,en-US;q=0.8,en;q=0.7,zh-CN;q=0.6",
      "cache-control": "no-cache",
      "content-type": "application/json",
      "pragma": "no-cache",
      "sec-fetch-dest": "empty",
      "sec-fetch-mode": "cors",
      "sec-fetch-site": "same-site"
    },
    "referrer": "https://www.asiamiles.com/zh/afr.html",
    "referrerPolicy": "no-referrer-when-downgrade",
    "body": null,
    "method": "GET",
    "mode": "cors"
  });
  let resultJson = await result.json();
  return resultJson.milesRequired && !resultJson.code;
}

(async () => {
  let routes = [];
  routes.push(['TPE', 'NRT']);
  routes.push(['TPE', 'KIX']);
  routes.push(['TPE', 'NGO']);
  routes.push(['TPE', 'ICN']);
  routes.push(['BKK', 'SIN']);
  routes.push(['YVR', 'JFK']);
  let airports = JSON.parse(fs.readFileSync('airport-info.json', 'utf-8'));
  airports.forEach(airport => {
    if(airport[2] == 'HKG') return;
    routes.push(['HKG', airport[2]]);
  });
  let availableRoutes = [];
  for(let route of routes){
    if(await verify(route[0], route[1])) availableRoutes.push(route);
  };
  fs.writeFileSync('routes.json', JSON.stringify(availableRoutes));
})();
