const express = require('express');
const { chromium } = require('playwright');
const axios = require('axios');

const app = express();
const port = process.env.PORT || 3000;

const memoryCache = {};
const CACHE_EXPIRATION = 24 * 60 * 60 * 1000; // 24 hours

let browser;
let cachedCookies = '';
let isRefreshing = false;

async function initBrowser() {
    if (browser) return;
    try {
        browser = await chromium.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
        });
        console.log('Browser initialized');
    } catch (e) {
        console.error('Browser init failed:', e.message);
    }
}

async function refreshCookies(city = 'baki') {
    if (isRefreshing) return;
    isRefreshing = true;
    console.log('[Auth] Refreshing session cookies...');
    
    let page;
    try {
        await initBrowser();
        const context = await browser.newContext({
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        });
        page = await context.newPage();
        
        // Block assets for speed
        await page.route('**/*', (route) => {
            const type = route.request().resourceType();
            if (['image', 'stylesheet', 'font'].includes(type)) return route.abort();
            route.continue();
        });

        await page.goto(`https://namaz.minber.az/${city}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await page.waitForTimeout(2500); // Wait for Imunify challenge

        const cookies = await context.cookies();
        cachedCookies = cookies.map(c => `${c.name}=${c.value}`).join('; ');
        console.log('[Auth] New cookies captured.');
        await context.close();
    } catch (e) {
        console.error('[Auth] Refresh failed:', e.message);
    } finally {
        isRefreshing = false;
        if (page) await page.close();
    }
}

app.get('/', (req, res) => {
    res.send('Minber Scraper (Hybrid) is running! Status: ' + (cachedCookies ? 'Authenticated' : 'Wait-for-traffic'));
});

app.get('/json/:city/:year/:month', async (req, res) => {
    const { city, year, month } = req.params;
    const cacheKey = `${city}-${year}-${month}`;

    // 1. Check Memory Cache
    if (memoryCache[cacheKey] && (Date.now() - memoryCache[cacheKey].timestamp < CACHE_EXPIRATION)) {
        console.log(`[Cache Hit] ${cacheKey}`);
        return res.json(memoryCache[cacheKey].data);
    }

    const apiUrl = `https://namaz.minber.az/json/${city}/${year}/${month}`;
    
    try {
        // 2. Try Fetching with current cookies
        console.log(`[Fetch] Starting: ${city}...`);
        let response = await axios.get(apiUrl, {
            headers: { 
                'Cookie': cachedCookies,
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            },
            timeout: 10000
        });

        // If we got HTML (Imunify challenge) instead of JSON
        if (typeof response.data === 'string' && response.data.includes('imunify360')) {
            console.log('[Fetch] Blocked by Imunify. Solving challenge...');
            await refreshCookies(city);
            
            // Retry once
            response = await axios.get(apiUrl, {
                headers: { 'Cookie': cachedCookies },
                timeout: 10000
            });
        }

        console.log(`[Success] Got data for ${city}.`);
        memoryCache[cacheKey] = { data: response.data, timestamp: Date.now() };
        res.json(response.data);

    } catch (error) {
        console.warn(`[Axios Failed] ${error.message}. Falling back to Browser Scraper.`);
        
        // 3. Last Resort: Full Browser Scrape
        let page;
        try {
            await initBrowser();
            const context = await browser.newContext();
            page = await context.newPage();
            await page.goto(`https://namaz.minber.az/${city}`, { waitUntil: 'domcontentloaded' });
            await page.waitForTimeout(2000);
            
            const data = await page.evaluate(async (url) => {
                const res = await fetch(url);
                return res.json();
            }, apiUrl);

            memoryCache[cacheKey] = { data, timestamp: Date.now() };
            res.json(data);
        } catch (finalError) {
            res.status(500).json({ error: 'All methods failed: ' + finalError.message });
        } finally {
            if (page) await page.close();
        }
    }
});

app.listen(port, '0.0.0.0', () => {
    console.log(`Hybrid Scraper listening on port ${port}`);
    // Warm up cookies on startup
    refreshCookies('baki').catch(() => {});
});
