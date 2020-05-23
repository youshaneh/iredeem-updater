import fs from 'fs';
import fetch from 'node-fetch';

(async () => {
  let airports = JSON.parse(fs.readFileSync('all-airports.json', 'utf-8'));
  let availableAirports = [];
  for(let i = 0 ; i < airports.length ; i++){
    let airport = airports[i];
    console.log('fetching HKG - ' + airport[2] + '...');
    await fetch("https://api.asiamiles.com/afr/searchpanel/searchoptions/zh.HKG." + airport[2] + ".rt.std.CX.json", {
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
    })
    .then(result => result.json())
    .then(resultJson => {
      if(resultJson.milesRequired && !resultJson.code){
        availableAirports.push(airport);
        console.log("available");
      }
    })
    await new Promise(resolve => setTimeout(resolve, 200));
  };
  fs.writeFileSync('available-airports.json', JSON.stringify(availableAirports));
})();
