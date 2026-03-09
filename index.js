const express = require('express');
const { chromium } = require('playwright');

const app = express();
const port = process.env.PORT || 3000;

app.get('/', (req, res) => {
    res.send('Minber Scraper Service is running! Use /json/:city/:year/:month to fetch data.');
});

const cache = {};

app.get('/json/:city/:year/:month', async (req, res) => {
    const { city, year, month } = req.params;
    const cacheKey = `${city}-${year}-${month}`;

    console.log(`[${new Date().toLocaleTimeString()}] Request: /json/${city}/${year}/${month}`);

    if (cache[cacheKey]) {
        console.log(`Serving from cache: ${cacheKey}`);
        return res.json(cache[cacheKey]);
    }

    if (!city || !year || !month) {
        return res.status(400).json({ error: 'Missing city, year, or month' });
    }

    let browser;
    try {
        console.log(`[${new Date().toLocaleTimeString()}] Launching browser for ${city}...`);
        browser = await chromium.launch({ 
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
        });
        const context = await browser.newContext({
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        });
        const page = await context.newPage();

        const targetUrl = `https://namaz.minber.az/${city}`;
        console.log(`Navigating to ${targetUrl}...`);
        await page.goto(targetUrl, { waitUntil: 'networkidle', timeout: 60000 });
        
        await page.waitForTimeout(3000);

        const apiRequestUrl = `https://namaz.minber.az/json/${city}/${year}/${month}`;
        console.log(`Fetching JSON from ${apiRequestUrl}...`);
        
        const data = await page.evaluate(async (url) => {
            const response = await fetch(url);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            return response.json();
        }, apiRequestUrl);

        console.log(`Successfully fetched data for ${city}. Saving to cache.`);
        cache[cacheKey] = data;
        res.json(data);
    } catch (error) {
        console.error(`Error for ${city}:`, error);
        res.status(500).json({ error: 'Failed to fetch prayer times: ' + error.message });
    } finally {
        if (browser) await browser.close();
    }
});

app.listen(port, '0.0.0.0', () => {
    console.log(`Scraper backend listening on all interfaces at port ${port}`);
});
