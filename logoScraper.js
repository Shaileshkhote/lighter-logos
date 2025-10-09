const axios = require('axios');
const fs = require('fs');
const path = require('path');

// Market data with symbols
const marketData = {
  "success": true,
  "code": 200,
  "order_book_details": [
    {
      "symbol": "1000TOSHI",
      "market_id": 81,
      "status": "active"
    },
    {
      "symbol": "ETHFI",
      "market_id": 64,
      "status": "active"
    },
    {
      "symbol": "POL",
      "market_id": 14,
      "status": "active"
    },
    {
      "symbol": "LINK",
      "market_id": 8,
      "status": "active"
    },
    {
      "symbol": "SKY",
      "market_id": 79,
      "status": "active"
    },
    {
      "symbol": "PENGU",
      "market_id": 47,
      "status": "active"
    },
    {
      "symbol": "1000FLOKI",
      "market_id": 19,
      "status": "active"
    },
    {
      "symbol": "BCH",
      "market_id": 58,
      "status": "active"
    },
    {
      "symbol": "DOGE",
      "market_id": 3,
      "status": "active"
    },
    {
      "symbol": "RESOLV",
      "market_id": 51,
      "status": "active"
    },
    {
      "symbol": "ZORA",
      "market_id": 53,
      "status": "active"
    },
    {
      "symbol": "SUI",
      "market_id": 16,
      "status": "active"
    },
    {
      "symbol": "ETH",
      "market_id": 0,
      "status": "active"
    },
    {
      "symbol": "USELESS",
      "market_id": 66,
      "status": "active"
    },
    {
      "symbol": "PROVE",
      "market_id": 57,
      "status": "active"
    },
    {
      "symbol": "ADA",
      "market_id": 39,
      "status": "active"
    },
    {
      "symbol": "APT",
      "market_id": 31,
      "status": "active"
    },
    {
      "symbol": "WLD",
      "market_id": 6,
      "status": "active"
    },
    {
      "symbol": "TRX",
      "market_id": 43,
      "status": "active"
    },
    {
      "symbol": "TAO",
      "market_id": 13,
      "status": "active"
    },
    {
      "symbol": "PENDLE",
      "market_id": 37,
      "status": "active"
    },
    {
      "symbol": "LTC",
      "market_id": 35,
      "status": "active"
    },
    {
      "symbol": "TON",
      "market_id": 12,
      "status": "active"
    },
    {
      "symbol": "SYRUP",
      "market_id": 44,
      "status": "active"
    },
    {
      "symbol": "1000SHIB",
      "market_id": 17,
      "status": "active"
    },
    {
      "symbol": "OP",
      "market_id": 55,
      "status": "active"
    },
    {
      "symbol": "NMR",
      "market_id": 74,
      "status": "active"
    },
    {
      "symbol": "PYTH",
      "market_id": 78,
      "status": "active"
    },
    {
      "symbol": "PAXG",
      "market_id": 48,
      "status": "active"
    },
    {
      "symbol": "AVNT",
      "market_id": 82,
      "status": "active"
    },
    {
      "symbol": "EIGEN",
      "market_id": 49,
      "status": "active"
    },
    {
      "symbol": "ARB",
      "market_id": 50,
      "status": "active"
    },
    {
      "symbol": "1000BONK",
      "market_id": 18,
      "status": "active"
    },
    {
      "symbol": "BTC",
      "market_id": 1,
      "status": "active"
    },
    {
      "symbol": "JUP",
      "market_id": 26,
      "status": "active"
    },
    {
      "symbol": "AI16Z",
      "market_id": 22,
      "status": "active"
    },
    {
      "symbol": "ZK",
      "market_id": 56,
      "status": "active"
    },
    {
      "symbol": "CRO",
      "market_id": 73,
      "status": "active"
    },
    {
      "symbol": "UNI",
      "market_id": 30,
      "status": "active"
    },
    {
      "symbol": "FARTCOIN",
      "market_id": 21,
      "status": "active"
    },
    {
      "symbol": "NEAR",
      "market_id": 10,
      "status": "active"
    },
    {
      "symbol": "PUMP",
      "market_id": 45,
      "status": "active"
    },
    {
      "symbol": "LINEA",
      "market_id": 76,
      "status": "active"
    },
    {
      "symbol": "DOT",
      "market_id": 11,
      "status": "active"
    },
    {
      "symbol": "LAUNCHCOIN",
      "market_id": 54,
      "status": "active"
    },
    {
      "symbol": "TRUMP",
      "market_id": 15,
      "status": "active"
    },
    {
      "symbol": "AAVE",
      "market_id": 27,
      "status": "active"
    },
    {
      "symbol": "MKR",
      "market_id": 28,
      "status": "inactive"
    },
    {
      "symbol": "CRV",
      "market_id": 36,
      "status": "active"
    },
    {
      "symbol": "GMX",
      "market_id": 61,
      "status": "active"
    },
    {
      "symbol": "SEI",
      "market_id": 32,
      "status": "active"
    },
    {
      "symbol": "MNT",
      "market_id": 63,
      "status": "active"
    },
    {
      "symbol": "AVAX",
      "market_id": 9,
      "status": "active"
    },
    {
      "symbol": "SPX",
      "market_id": 42,
      "status": "active"
    },
    {
      "symbol": "DOLO",
      "market_id": 75,
      "status": "active"
    },
    {
      "symbol": "ENA",
      "market_id": 29,
      "status": "active"
    },
    {
      "symbol": "MYX",
      "market_id": 80,
      "status": "active"
    },
    {
      "symbol": "YZY",
      "market_id": 70,
      "status": "active"
    },
    {
      "symbol": "WIF",
      "market_id": 5,
      "status": "active"
    },
    {
      "symbol": "IP",
      "market_id": 34,
      "status": "active"
    },
    {
      "symbol": "TIA",
      "market_id": 67,
      "status": "active"
    },
    {
      "symbol": "HYPE",
      "market_id": 24,
      "status": "active"
    },
    {
      "symbol": "LDO",
      "market_id": 46,
      "status": "active"
    },
    {
      "symbol": "VIRTUAL",
      "market_id": 41,
      "status": "active"
    },
    {
      "symbol": "BNB",
      "market_id": 25,
      "status": "active"
    },
    {
      "symbol": "XRP",
      "market_id": 7,
      "status": "active"
    },
    {
      "symbol": "POPCAT",
      "market_id": 23,
      "status": "active"
    },
    {
      "symbol": "XMR",
      "market_id": 77,
      "status": "active"
    },
    {
      "symbol": "MORPHO",
      "market_id": 68,
      "status": "active"
    },
    {
      "symbol": "XPL",
      "market_id": 71,
      "status": "active"
    },
    {
      "symbol": "S",
      "market_id": 40,
      "status": "active"
    },
    {
      "symbol": "AERO",
      "market_id": 65,
      "status": "active"
    },
    {
      "symbol": "VVV",
      "market_id": 69,
      "status": "active"
    },
    {
      "symbol": "BERA",
      "market_id": 20,
      "status": "active"
    },
    {
      "symbol": "ONDO",
      "market_id": 38,
      "status": "active"
    },
    {
      "symbol": "ZRO",
      "market_id": 60,
      "status": "active"
    },
    {
      "symbol": "GRASS",
      "market_id": 52,
      "status": "active"
    },
    {
      "symbol": "DYDX",
      "market_id": 62,
      "status": "active"
    },
    {
      "symbol": "WLFI",
      "market_id": 72,
      "status": "active"
    },
    {
      "symbol": "1000PEPE",
      "market_id": 4,
      "status": "active"
    },
    {
      "symbol": "KAITO",
      "market_id": 33,
      "status": "active"
    },
    {
      "symbol": "HBAR",
      "market_id": 59,
      "status": "active"
    },
    {
      "symbol": "SOL",
      "market_id": 2,
      "status": "active"
    }
  ]
};

// API endpoint for market data
const MARKET_DATA_API = 'https://mainnet.zklighter.elliot.ai/api/v1/orderBookDetails';

// Base URL for logos
const BASE_URL = 'https://app.hyperliquid.xyz/coins';

// Function to clean symbol (remove 1000 prefix if present)
function cleanSymbol(symbol) {
    if (symbol.startsWith('1000')) {
        return symbol.substring(4);
    }
    return symbol;
}

// Function to fetch market data from API
async function fetchMarketData() {
    try {
        console.log('Fetching market data from API...');
        const response = await axios({
            method: 'GET',
            url: MARKET_DATA_API,
            headers: {
                'accept': 'application/json'
            },
            timeout: 15000 // 15 second timeout
        });

        if (response.data && response.data.order_book_details) {
            console.log(`✅ Successfully fetched ${response.data.order_book_details.length} market entries`);
            return response.data;
        } else {
            throw new Error('Invalid response structure from API');
        }
    } catch (error) {
        console.error('❌ Failed to fetch market data from API:', error.message);
        console.log('📋 Using fallback hardcoded market data...');
        return marketData; // Fallback to hardcoded data
    }
}

// Function to get already downloaded logos
function getExistingLogos(logosDir) {
    try {
        if (!fs.existsSync(logosDir)) {
            return [];
        }
        
        const files = fs.readdirSync(logosDir);
        const existingLogos = files
            .filter(file => file.endsWith('.svg'))
            .map(file => file.replace('.svg', ''));
        
        console.log(`📁 Found ${existingLogos.length} existing logos`);
        return existingLogos;
    } catch (error) {
        console.error('❌ Error reading existing logos:', error.message);
        return [];
    }
}

// Function to create logos directory if it doesn't exist
function ensureLogosDirectory() {
    const logosDir = path.join(__dirname, 'logos');
    if (!fs.existsSync(logosDir)) {
        fs.mkdirSync(logosDir, { recursive: true });
        console.log('Created logos directory');
    }
    return logosDir;
}

// Function to download a single logo
async function downloadLogo(symbol, logosDir) {
    try {
        const cleanedSymbol = cleanSymbol(symbol);
        const url = `${BASE_URL}/${cleanedSymbol}.svg`; // Use cleaned symbol for URL
        const filename = `${symbol}.svg`; // Use original symbol for filename
        const filepath = path.join(logosDir, filename);

        console.log(`Downloading ${symbol} (from ${cleanedSymbol}) -> ${filename}...`);
        
        const response = await axios({
            method: 'GET',
            url: url,
            responseType: 'stream',
            timeout: 10000 // 10 second timeout
        });

        const writer = fs.createWriteStream(filepath);
        response.data.pipe(writer);

        return new Promise((resolve, reject) => {
            writer.on('finish', () => {
                console.log(`✅ Successfully downloaded ${filename}`);
                resolve();
            });
            writer.on('error', (error) => {
                console.error(`❌ Failed to save ${filename}:`, error.message);
                reject(error);
            });
        });

    } catch (error) {
        console.error(`❌ Failed to download ${symbol}:`, error.message);
        throw error;
    }
}

// Function to download all logos with rate limiting
async function downloadAllLogos() {
    const logosDir = ensureLogosDirectory();
    
    // Fetch market data dynamically from API
    const dynamicMarketData = await fetchMarketData();
    
    // Get all active symbols
    const allActiveSymbols = dynamicMarketData.order_book_details
        .filter(item => item.status === 'active')
        .map(item => item.symbol);
    
    // Get existing logos to filter out
    const existingLogos = getExistingLogos(logosDir);
    
    // Filter out symbols that already have logos downloaded
    const symbolsToDownload = allActiveSymbols.filter(symbol => !existingLogos.includes(symbol));
    
    console.log(`Total active symbols: ${allActiveSymbols.length}`);
    console.log(`Already downloaded: ${existingLogos.length}`);
    console.log(`New logos to download: ${symbolsToDownload.length}`);
    
    if (symbolsToDownload.length === 0) {
        console.log('🎉 All logos are already downloaded!');
        return;
    }
    
    console.log(`Starting download of ${symbolsToDownload.length} new logos...`);
    console.log('==================================================');

    let successful = 0;
    let failed = 0;

    for (let i = 0; i < symbolsToDownload.length; i++) {
        const symbol = symbolsToDownload[i];
        
        try {
          console.log(symbol);
            await downloadLogo(symbol, logosDir);
            successful++;
            
            // Add small delay to be respectful to the server
            if (i < symbolsToDownload.length - 1) {
                await new Promise(resolve => setTimeout(resolve, 200)); // 200ms delay
            }
        } catch (error) {
            failed++;
        }
    }

    console.log('==================================================');
    console.log(`Download complete!`);
    console.log(`✅ Successful: ${successful}`);
    console.log(`❌ Failed: ${failed}`);
    console.log(`📁 Logos saved to: ${logosDir}`);
}

// Function to download specific symbols
async function downloadSpecificLogos(symbols) {
    const logosDir = ensureLogosDirectory();
    
    console.log(`Downloading ${symbols.length} specific logos...`);
    console.log('==================================================');

    for (const symbol of symbols) {
        try {
            await downloadLogo(symbol, logosDir);
            await new Promise(resolve => setTimeout(resolve, 200));
        } catch (error) {
            // Error already logged in downloadLogo
        }
    }
    
    console.log('==================================================');
    console.log(`Specific download complete!`);
}

// Main execution
async function main() {
    const args = process.argv.slice(2);
    
    if (args.length === 0) {
        // Download all logos
        await downloadAllLogos();
    } else {
        // Download specific symbols passed as arguments
        await downloadSpecificLogos(args);
    }
}

// Handle uncaught exceptions
process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
    process.exit(1);
});

// Run the script
if (require.main === module) {
    main().catch(console.error);
}

module.exports = {
    downloadAllLogos,
    downloadSpecificLogos,
    cleanSymbol,
    fetchMarketData,
    getExistingLogos
};
