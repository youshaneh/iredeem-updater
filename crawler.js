import puppeteer from 'puppeteer';
import fetch from 'node-fetch';
import fs from 'fs';

export async function getRequestparameters() {
  const browser = await puppeteer.launch({
    headless: false
  });
  const page = await browser.newPage();
  await page.setRequestInterception(true);
  page.on('request', interceptedRequest => {
    if (interceptedRequest.url().endsWith('.png') ||
      interceptedRequest.url().endsWith('.jpg') ||
      interceptedRequest.url().endsWith('.gif') ||
      interceptedRequest.url().endsWith('.ico') ||
      interceptedRequest.url().endsWith('.svg') ||
      interceptedRequest.url().endsWith('.ttf') ||
      interceptedRequest.url().endsWith('.woff') ||
      interceptedRequest.url().endsWith('.woff2')) {
      interceptedRequest.abort();
    }
    else {
      interceptedRequest.continue();
    }
  });
  page.setDefaultTimeout(3 * 60 * 1000);

  console.info("connecting...");
  await page.goto('https://www.cathaypacific.com/cx/zh_TW/book-a-trip/redeem-flights/facade.html?switch=Y',
    { waitUntil: 'load'});

  console.info("logging in...");
  await page.type('#membership-id', process.env.AM_ID);
  await page.type('#password', process.env.AM_PASSWORD);
  await page.click('[type=submit][data-tealium-event=MEMBER]');
  await page.waitForSelector('#tab-tripType-ow');

  console.info("filling in the fields...");
  await page.click('#tab-tripType-ow');
  await page.waitFor(100);
  await page.type('[aria-controls="react-autowhatever-segments[0].destination"]', 'NRT');
  await page.waitFor(100);
  await page.click('[data-suggestion-index="0"]');
  await page.waitFor(100);
  await page.click('.ibered__form-dp-hit-test-container');
  await page.waitFor(100);
  await page.click('.CalendarMonthGrid_month__horizontal.CalendarMonthGrid_month__horizontal_1:nth-child(3) .CalendarDay__default_2');
  await page.waitFor(100);
  console.info("sending the request...");
  await page.click('[type="submit"][tabindex="0"]');
  await page.waitForSelector('.date-card.available.ng-scope:last-child');

  console.info("getting the request template...");
  return new Promise(async res => {
    let interceptor = async request => {
      //TODO: The url is sometimes 'https://book.cathaypacific.com/CathayPacificAwardV3/dyn/air/booking/upsell?TAB_ID='
      if (!request.url().startsWith('https://book.cathaypacific.com/CathayPacificAwardV3/dyn/air/booking/availability?TAB_ID=')) return;
      console.debug("found a request matching the url pattern...");
      page.removeListener('request', interceptor);
      let cookie = await page.cookies()
        .then(cookies => cookies.reduce((accumulator, currentValue) =>
          `${accumulator}${currentValue.name}=${currentValue.value}; `, ''))
        .then(cookie => cookie.substring(0, cookie.length - 2));
      console.debug("got cookie successfully...");
      let body = request.postData();
      let headers = request.headers();
      res({ cookie, body, headers });
      setTimeout(() => browser.close());
    }
    page.on('request', interceptor);
    await page.evaluate(() => {
      //The button is smoetimes covered by a modal, which makes the clicking ineffectual.
      //Run a script that invokes its click method instead.
      document.querySelector('.date-card.available.ng-scope:last-child').click();
    });
    console.debug("request submitted...");
  });
}

//TODO: change from, to, and date fields in POST body
export async function getFlights(from, to, date, sampleParams) {
  fetch("https://book.cathaypacific.com/CathayPacificAwardV3/dyn/air/booking/availability", {
    "headers": {
      "accept": "application/json, text/plain, */*",
      "accept-language": "en-US,en;q=0.9",
      "cache-control": "no-cache",
      "content-type": "application/x-www-form-urlencoded",
      "pragma": "no-cache",
      "sec-fetch-dest": "empty",
      "sec-fetch-mode": "cors",
      "sec-fetch-site": "same-origin",
      "x-distil-ajax": sampleParams.headers['x-distil-ajax'],
      "cookie": sampleParams.cookie
    },
    "referrer": "https://book.cathaypacific.com/CathayPacificAwardV3/dyn/air/booking/availability",
    "referrerPolicy": "no-referrer-when-downgrade",
    "body": sampleParams.body,
    "method": "POST",
    "mode": "cors"
  })
    .then(response => response.json())
    .then(responseJson => {
      console.log(JSON.parse(responseJson.pageBom).modelObject
        .availabilities.upsell.bounds[0].flights);
      fs.writeFileSync('flights.json', responseJson.pageBom);
    })
    .catch(e => console.error(e));
}