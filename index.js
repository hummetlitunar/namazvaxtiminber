const express = require('express');
const { chromium } = require('playwright');

const app = express();
const port = process.env.PORT || 3000;

app.get('/', (req, res) => {
    res.send('Minber Scraper Service is running! Use /json/:city/:year/:month to fetch data.');
});

const cache = {};
const CACHE_TIMEOUT = 24 * 60 * 60 * 1000; // 24 hours

let browser;

// Initialize browser once
async function initBrowser() {
    try {
        browser = await chromium.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
        });
        console.log('Global browser initialized.');
    } catch (e) {
        console.error('Failed to init browser:', e);
    }
}

initBrowser();

app.get('/json/:city/:year/:month', async (req, res) => {
    const { city, year, month } = req.params;
    const cacheKey = `${city}-${year}-${month}`;

    // 1. Check Cache
    if (cache[cacheKey] && (Date.now() - cache[cacheKey].timestamp < CACHE_TIMEOUT)) {
        console.log(`[Cache Hit] Serving ${cacheKey}`);
        return res.json(cache[cacheKey].data);
    }

    if (!city || !year || !month) {
        return res.status(400).json({ error: 'Missing city, year, or month' });
    }

    let page;
    try {
        if (!browser) await initBrowser();
        
        console.log(`[Scraping] ${city}...`);
        const context = await browser.newContext({
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        });
        page = await context.newPage();

        // SPEED OPTIMIZATION: Block unnecessary resources
        await page.route('**/*', (route) => {
            const type = route.request().resourceType();
            if (['image', 'stylesheet', 'font', 'media'].includes(type)) {
                route.abort();
            } else {
                route.continue();
            }
        });

        const targetUrl = `https://namaz.minber.az/${city}`;
        await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
        
        // Wait just enough for the challenge to clear
        await page.waitForTimeout(1500);

        const apiRequestUrl = `https://namaz.minber.az/json/${city}/${year}/${month}`;
        const data = await page.evaluate(async (url) => {
            const response = await fetch(url);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            return response.json();
        }, apiRequestUrl);

        console.log(`[Success] ${city} cached.`);
        cache[cacheKey] = { data, timestamp: Date.now() };
        res.json(data);
    } catch (error) {
        console.error(`[Error] ${city}:`, error.message);
        res.status(500).json({ error: 'Scraping failed: ' + error.message });
    } finally {
        if (page) await page.close();
    }
});

app.listen(port, '0.0.0.0', () => {
    console.log(`Scraper backend listening on all interfaces at port ${port}`);
});
