import puppeteer from 'puppeteer';
import fetch from 'node-fetch';
import fs from 'fs';

export async function getRequestparameters() {
  const browser = await puppeteer.launch({
    headless: process.env.NODE_ENV != 'dev'
  });
  const page = await browser.newPage();
  page.setDefaultTimeout(3 * 60 * 1000);
  if (process.env.NODE_ENV == 'dev') {
    await page.setViewport({ width: 1100, height: 800 })
  }
  else {
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
  }

  console.info("connecting...");
  await page.goto('https://www.cathaypacific.com/cx/zh_TW/book-a-trip/redeem-flights/facade.html?switch=Y',
    { waitUntil: 'load' });

  console.info("logging in...");
  await page.type('#membership-id', process.env.AM_ID);
  await page.type('#password', process.env.AM_PASSWORD);
  await page.click('[type=submit][data-tealium-event=MEMBER]');
  await page.waitForSelector('#tab-tripType-ow');

  console.info("filling in the fields...");
  await page.click('#tab-tripType-ow');
  await page.waitFor(100);
  await page.click('[aria-controls="react-autowhatever-segments[0].destination"]');
  await page.waitFor(100);
  await page.type('[aria-controls="react-autowhatever-segments[0].destination"]', 'YYZ');
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
  return new Promise(async resolve => {
    let interceptor = async request => {
      //TODO: The url is sometimes 'https://book.cathaypacific.com/CathayPacificAwardV3/dyn/air/booking/upsell?TAB_ID='
      if (request.url().startsWith('https://book.cathaypacific.com/CathayPacificAwardV3/dyn/air/booking/upsell?TAB_ID=')) {
        console.debug("found a request to upsell...!!!");
        page.removeListener('request', interceptor);
        let cookie = await page.cookies()
          .then(cookies => cookies.reduce((accumulator, currentValue) =>
            `${accumulator}${currentValue.name}=${currentValue.value}; `, ''))
          .then(cookie => cookie.substring(0, cookie.length - 2));
        let body = request.postData();
        let headers = request.headers();
        fs.writeFileSync('error_log/upsell.json', JSON.stringify({ cookie, body, headers }));
      }
      if (request.url().startsWith('https://book.cathaypacific.com/CathayPacificAwardV3/dyn/air/booking/availability?TAB_ID=')) {
        console.debug("found a request matching the url pattern...");
        page.removeListener('request', interceptor);
        let cookie = await page.cookies()
          .then(cookies => cookies.reduce((accumulator, currentValue) =>
            `${accumulator}${currentValue.name}=${currentValue.value}; `, ''))
          .then(cookie => cookie.substring(0, cookie.length - 2));
        let body = request.postData();
        let headers = request.headers();
        resolve({ cookie, body, headers });
      }
      // TODO: reuse the browser page to get new post body and
      // cookies when current ones expire 
    }
    page.on('request', interceptor);
    await page.evaluate(() => {
      //The button is smoetimes covered by a modal, which makes the clicking ineffectual.
      //Run a script that invokes its click method instead.
      document.querySelector('.date-card.available.ng-scope:last-child').click();
    });
  });
}

export async function getFlights(from, to, date, sampleParams) {
  date = date.replace(/-/g, '').concat('0000');
  let body = sampleParams.body;
  body = body.replace(/(^|&)B_LOCATION_1=[A-Z]{3}($|&)/, `$1B_LOCATION_1=${from}$2`);
  body = body.replace(/(^|&)E_LOCATION_1=[A-Z]{3}($|&)/, `$1E_LOCATION_1=${to}$2`);
  body = body.replace(/(^|&)(B_DATE_1=|WDS_DATE=)[0-9]{12}($|&)/g,
    ($0, $1, $2, $3) => $1 + $2 + date + $3);
  return fetch("https://book.cathaypacific.com/CathayPacificAwardV3/dyn/air/booking/availability", {
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
    "body": body,
    "method": "POST",
    "mode": "cors"
  })
    .then(response => response.json())
    .then(responseJson => {
      let pageBom = JSON.parse(responseJson.pageBom);
      if (pageBom?.modelObject?.isContainingErrors) {
        console.error(`fail to get flight ${from}_${to}_${date}: ${pageBom.modelObject.messages?.text}`);
      }
      let flights = pageBom?.modelObject?.availabilities?.upsell?.bounds[0]?.flights;
      return flights;
    })
    .catch(e => {
      throw e;
    });
}

// Rules:
// CX/KA[L] = L
// CX/KA[L] + CX/KA[L] = L
// CX/KA[L] + other[1-9] = N
// other[L] = N
// other[L] + other[L] = N
// ---
// Cabins:
// R: ECO, economy
// N: PEY, premium economy
// B: BUS, business
// F: FIR, first

export async function updateDB(from, to, date, receivedItineraries, iRedeemRepository) {
  let itineraries = [];
  receivedItineraries.forEach(receivedItinerary => {
    let itinerary = [];
    receivedItinerary.segments.forEach(receivedFlight => {
      let airline = receivedFlight.flightIdentifier.marketingAirline;
      let flight_number = receivedFlight.flightIdentifier.flightNumber;
      let aircraft = receivedFlight.equipment;
      let status_f = receivedFlight.cabins.F?.status || 'X';
      let status_b = receivedFlight.cabins.B?.status || 'X';
      let status_r = receivedFlight.cabins.R?.status || 'X';
      let status_n = receivedFlight.cabins.N?.status || 'X';
      let [departure_terminal, departure_airport] = receivedFlight.originLocation.split('_');
      let departure_time = new Date(receivedFlight.flightIdentifier.originDate)
        .toISOString().slice(0, 19).replace('T', ' ');
      let [arrival_terminal, arrival_airport] = receivedFlight.destinationLocation.split('_');
      let arrival_time = new Date(receivedFlight.destinationDate)
        .toISOString().slice(0, 19).replace('T', ' ');
      let flight = {
        airline, flight_number, aircraft,
        status_f, status_b, status_r, status_n,
        departure_airport, departure_terminal, departure_time,
        arrival_airport, arrival_terminal, arrival_time
      };
      itinerary.push(flight);
    });
    itineraries.push(itinerary);
  });
  await iRedeemRepository.updateInterval(from, to, date, itineraries);
}
