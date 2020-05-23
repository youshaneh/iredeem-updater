import puppeteer from 'puppeteer';
import fetch from 'node-fetch';
import fs from 'fs';

let browser;
let page;
let sampleReqParams;
let requestQuota;

export async function initBrowserPage(retry = 5) {
  try {
    if (browser) await browser.close();
    browser = await puppeteer.launch({
      headless: process.env.NODE_ENV != 'dev'
    });

    page = await browser.newPage();
    page.setDefaultTimeout(3 * 60 * 1000);
    if (process.env.NODE_ENV != 'dev') {
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

    await page.goto('https://www.cathaypacific.com/cx/zh_TW/book-a-trip/redeem-flights/facade.html?switch=Y',
      { waitUntil: 'load' });
    await page.type('#membership-id', process.env.AM_ID);
    await page.type('#password', process.env.AM_PASSWORD);
    await page.click('[type=submit][data-tealium-event=MEMBER]');
    await page.waitForSelector('#tab-tripType-ow');
  }
  catch (e) {
    if (retry < 0) throw e;
    console.error(e);
    await initBrowserPage(retry - 1);
  }
}

export async function setupAndGetRequestParameters(retry = 5, nthAttempt = 0) {
  try {
    await fillInBlanks(nthAttempt);
    await getRequestParameters();
  }
  catch (e) {
    if (retry < 0) throw e;
    console.error(e);
    await setupAndGetRequestParameters(retry - 1, nthAttempt + 1);
  }
}

async function fillInBlanks(nthAttempt) {
  console.log('filling in blanks #' + nthAttempt + ' attempt');
  await page.click('#tab-tripType-ow');
  await page.waitFor(100);
  await page.click('[aria-controls="react-autowhatever-segments[0].destination"]');
  await page.waitFor(100);
  await page.type('[aria-controls="react-autowhatever-segments[0].destination"]', 'NRT');
  await page.waitFor(100);
  await page.click('[data-suggestion-index="0"]');
  await page.waitFor(100);
  await page.click('.ibered__form-dp-hit-test-container');
  await page.waitFor(100);
  await page.evaluate(nthAttempt => {
    document.querySelectorAll('.CalendarDay.CalendarDay_1.CalendarDay__default.CalendarDay__default_2')[nthAttempt + 20].click();
  }, nthAttempt);
  await page.waitFor(100);
}

export async function getRequestParameters() {
  console.log("searching flights for an arbitrary day...");
  await page.evaluate(() => {
    document.querySelector('[type="submit"][tabindex="0"]').click()
  });
  await page.waitForSelector('.date-card.available.ng-scope');
  await page.evaluate(() => {
    let showAllFlights = document.querySelector('[data-ng-click="leavePage.directToSchedule($event)"]');
    if (showAllFlights) {
      showAllFlights.click();
    }
  });
  await page.waitForSelector('[data-ng-click="awai.selectDate($event, 0, dateCard) "]');
  await page.waitFor(1000);

  sampleReqParams = await new Promise(async resolve => {
    let interceptor = async request => {
      if (request.url().startsWith('https://book.cathaypacific.com/CathayPacificAwardV3/dyn/air/booking/availability?TAB_ID=')) {
        page.removeListener('request', interceptor);
        let cookie = await page.cookies()
          .then(cookies => cookies.reduce((accumulator, currentValue) =>
            `${accumulator}${currentValue.name}=${currentValue.value}; `, ''))
          .then(cookie => cookie.substring(0, cookie.length - 2));
        let body = request.postData();
        let headers = request.headers();
        await page.evaluate(() => {
          document.querySelector('.flight-details-btn-wrap .btn-modify-itinerary').click();
          document.querySelector('[data-ng-click="leavePage.CathayFacade.submitSearch();"]').click();
        });
        resolve({ cookie, body, headers });
      }
    }
    page.on('request', interceptor);
    console.log("searching flights for another day to get a request template...");
    await page.evaluate(() => {
      document.querySelector('[data-ng-click="awai.selectDate($event, 0, dateCard) "]').click();
    });
  });
  requestQuota = 18;
}

export async function getFlights(from, to, date) {
  if(requestQuota <= 0) throw new Error('Request quota is used up');
  requestQuota--;
  date = date.replace(/-/g, '').concat('0000');
  let body = sampleReqParams.body;
  body = body.replace(/(^|&)B_LOCATION_1=[A-Z]{3}($|&)/, `$1B_LOCATION_1=${from}$2`);
  body = body.replace(/(^|&)E_LOCATION_1=[A-Z]{3}($|&)/, `$1E_LOCATION_1=${to}$2`);
  body = body.replace(/(^|&)(B_DATE_1=|WDS_DATE=)[0-9]{12}($|&)/g,
    ($0, $1, $2, $3) => $1 + $2 + date + $3);
  console.log(`fetching ${from}_${to}_${date}`);
  let response = await fetch("https://book.cathaypacific.com/CathayPacificAwardV3/dyn/air/booking/availability", {
    "headers": {
      "accept": "application/json, text/plain, */*",
      "accept-language": "en-US,en;q=0.9",
      "cache-control": "no-cache",
      "content-type": "application/x-www-form-urlencoded",
      "pragma": "no-cache",
      "sec-fetch-dest": "empty",
      "sec-fetch-mode": "cors",
      "sec-fetch-site": "same-origin",
      "x-distil-ajax": sampleReqParams.headers['x-distil-ajax'],
      "cookie": sampleReqParams.cookie
    },
    "referrer": "https://book.cathaypacific.com/CathayPacificAwardV3/dyn/air/booking/availability",
    "referrerPolicy": "no-referrer-when-downgrade",
    "body": body,
    "method": "POST",
    "mode": "cors"
  });
  let responseText = await response.text();
  let responseJson;
  try {
    responseJson = JSON.parse(responseText);
  }
  catch (e) {
    fs.writeFileSync(`error_log/${from}_${to}_${date}_response.html`, responseText);
    throw e;
  }
  let pageBom = JSON.parse(responseJson.pageBom);
  if (pageBom?.modelObject?.isContainingErrors) {
    if (pageBom.modelObject.messages[0].code == '9100') return [];
    fs.writeFileSync(`error_log/${from}_${to}_${date}_response.html`, responseText);
    throw e;
  }
  let flights = pageBom?.modelObject?.availabilities?.upsell?.bounds[0]?.flights;
  return flights;
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
      let status_f = receivedFlight.cabins?.F?.status || 'X';
      let status_b = receivedFlight.cabins?.B?.status || 'X';
      let status_r = receivedFlight.cabins?.R?.status || 'X';
      let status_n = receivedFlight.cabins?.N?.status || 'X';
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
