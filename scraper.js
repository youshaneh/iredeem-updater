import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import AdblockerPlugin from 'puppeteer-extra-plugin-adblocker';
import fetch from 'node-fetch';
import fs from 'fs';

puppeteer.use(StealthPlugin());
puppeteer.use(AdblockerPlugin({
  blockTrackers: true
}));

let browser;
let page;
let sampleReqParams;
let requestQuota;

export async function initBrowserPage() {
  if (browser) await browser.close();
  browser = await puppeteer.launch({
    headless: false
  });

  page = await browser.newPage();
  page.setDefaultTimeout(2 * 60 * 1000);

  await page.goto('https://www.asiamiles.com/zh/redeem-awards/flight-awards/facade.html?recent_search=ow', {
    waitUntil: 'load'
  });
  await page.type('.main-wrapper [name="username"]', process.env.AM_ID);
  await page.waitFor(800);
  await page.type('.main-wrapper [name="password"]', process.env.AM_PASSWORD);
  await page.waitFor(800);
  await page.click('.main-wrapper .center-single-button.login-submit [type="submit"]');
}

export async function setupAndGetRequestParameters(retry = 10) {
  for (let i = 0; i <= retry; i++) {
    try {
      await fillInSearchForm(i + 23);
      await getRequestParameters();
      return;
    } catch (e) {
      if (i > retry) {
        throw e;
      }
      else {
        console.error(e);
      }
    }
  }
}

async function fillInSearchForm(nDaysAfter) {
  await page.waitForSelector('#tab-tripType-ow');
  await page.click('[aria-controls="react-autowhatever-segments[0].destination"]');
  await page.waitFor(800);
  await page.type('[aria-controls="react-autowhatever-segments[0].destination"]', 'NRT');
  await page.waitFor(800);
  await page.click('[data-suggestion-index="0"]');
  await page.waitFor(800);
  await page.click('.ibered__form-dp-hit-test-container');
  await page.waitFor(800);
  await page.evaluate(nthElement => {
    document.querySelectorAll('.CalendarDay.CalendarDay_1.CalendarDay__default.CalendarDay__default_2')[nthElement].click();
  }, nDaysAfter);
}

export async function getRequestParameters() {
  let date = await page.evaluate(() => document.querySelector('.ibered__form-dp-value-display').innerHTML);
  console.log(`searching flights for ${date}...`);
  await page.evaluate(() => {
    document.querySelector('[type="submit"][tabindex="0"]').click()
  });

  await waitUntilVisible('.see-all-schedule-flights.ng-binding');
  await page.waitFor(1500);
  await page.evaluate(() => {
    document.querySelector('[data-ng-click="leavePage.directToSchedule($event)"]').click();
  });

  return new Promise(async (resolve, reject) => {
    let interceptor = async request => {
      if (request.url().startsWith('https://book.asiamiles.com/CathayPacificAwardV3/dyn/air/booking/availability?TAB_ID=')) {
        page.removeListener('request', interceptor);
        let cookie = (await page.cookies()).reduce((accumulator, currentValue) =>
          `${accumulator}${currentValue.name}=${currentValue.value}; `, '').slice(0, -2);
        let body = request.postData();
        let headers = request.headers();
        await page.waitForSelector('.flight-details-btn-wrap .btn-modify-itinerary');
        await page.waitFor(800);
        await page.evaluate(() => {
          document.querySelector('[data-ng-click="leavePage.CathayFacade.submitSearch();"]').click();
        });
        requestQuota = 18;
        sampleReqParams = {
          cookie,
          body,
          headers
        }
        resolve();
      }
    }
    page.on('request', interceptor);

    try {
      await waitUntilVisible('[data-ng-click="awai.selectDate($event, 0, dateCard) "]');
      await page.waitFor(800);
      await page.evaluate(() => {
        document.querySelector('[data-ng-click="awai.selectDate($event, 0, dateCard) "]').click();
      });
    }
    catch (e) {
      reject(e);
    }
  });
}

async function waitUntilVisible(selector) {
  await page.waitForFunction(`document.querySelector('${selector}') && document.querySelector('${selector}').clientHeight != 0`);
}

export async function getFlights(from, to, date, retry = 2) {
  for (let i = 0; i <= retry; i++) {
    try {
      if (--requestQuota < 0) await getRequestParameters();
      date = date.replace(/-/g, '').concat('0000');
      let body = sampleReqParams.body;
      body = body.replace(/(^|&)B_LOCATION_1=[A-Z]{3}($|&)/, `$1B_LOCATION_1=${from}$2`);
      body = body.replace(/(^|&)E_LOCATION_1=[A-Z]{3}($|&)/, `$1E_LOCATION_1=${to}$2`);
      body = body.replace(/(^|&)(B_DATE_1=|WDS_DATE=)[0-9]{12}($|&)/g,
        ($0, $1, $2, $3) => $1 + $2 + date + $3);

      console.log(`fetching ${from}_${to}_${date}`);
      let response = await fetch("https://book.asiamiles.com/CathayPacificAwardV3/dyn/air/booking/availability", {
        "headers": {
          "accept": "application/json, text/plain, */*",
          "accept-language": "zh-TW,zh;q=0.9,en-US;q=0.8,en;q=0.7,zh-CN;q=0.6",
          "cache-control": "no-cache",
          "content-type": "application/x-www-form-urlencoded",
          "pragma": "no-cache",
          "sec-fetch-dest": "empty",
          "sec-fetch-mode": "cors",
          "sec-fetch-site": "same-origin",
          "x-distil-ajax": sampleReqParams.headers['x-distil-ajax'],
          "cookie": sampleReqParams.cookie
        },
        "referrer": "https://book.asiamiles.com/CathayPacificAwardV3/dyn/air/booking/availability",
        "referrerPolicy": "no-referrer-when-downgrade",
        "body": body,
        "method": "POST",
        "mode": "cors"
      });
      if (!response.ok) {
        fs.writeFileSync(`error_log/${from}_${to}_${date}_response.json`, JSON.stringify(response));
        throw new Error(response.statusText)
      }
      let responseText = await response.text();
      let responseJson;
      try {
        responseJson = JSON.parse(responseText);
      } catch (e) {
        fs.writeFileSync(`error_log/${from}_${to}_${date}_response.html`, responseText);
        throw e;
      }
      let pageBom = JSON.parse(responseJson.pageBom);
      if (pageBom?.modelObject?.isContainingErrors) {
        if (pageBom.modelObject.messages[0].code == '9100') return [];
        fs.writeFileSync(`error_log/${from}_${to}_${date}_response.html`, responseText);
        throw new Error(JSON.stringify(pageBom.modelObject.messages[0]));
      }
      let flights = pageBom?.modelObject?.availabilities?.upsell?.bounds[0]?.flights;
      return flights;
    } catch (e) {
      if (i > retry) {
        throw e;
      }
      else {
        console.error(e);
      }
    }
  }
}