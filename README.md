# Hyperliquid Logo Scraper

A Node.js script that automatically downloads SVG logos for all trading symbols from Hyperliquid exchange.

## Features

- Downloads all active trading symbol logos from `https://app.hyperliquid.xyz/coins/{SYMBOL}.svg`
- Automatically handles symbols with "1000" prefix (e.g., `1000PEPE` → saves as `PEPE.svg`)
- Creates a `logos` folder to organize downloaded files
- Includes rate limiting to be respectful to the server
- Supports downloading all logos or specific symbols
- Progress tracking and error handling

## Installation

1. Clone or download this repository
2. Install dependencies:

```bash
npm install
```

## Usage

### Download All Logos

To download all active trading symbol logos:

```bash
npm start
```

or

```bash
npm run download-all
```

or directly with node:

```bash
node logoScraper.js
```

### Download Specific Logos

To download specific symbols, pass them as arguments:

```bash
node logoScraper.js BTC ETH SOL
```

This will download only the logos for Bitcoin, Ethereum, and Solana.

## Output

- All logos are saved in the `logos` folder
- Files are saved as `{SYMBOL}.svg`
- Symbols starting with "1000" are cleaned (e.g., `1000PEPE.svg` becomes `PEPE.svg`)
- The script shows progress and success/failure counts

## Example Output

```
Starting download of 85 logos...
==================================================
Downloading 1000TOSHI -> TOSHI.svg...
✅ Successfully downloaded TOSHI.svg
Downloading ETHFI -> ETHFI.svg...
✅ Successfully downloaded ETHFI.svg
Downloading POL -> POL.svg...
✅ Successfully downloaded POL.svg
...
==================================================
Download complete!
✅ Successful: 83
❌ Failed: 2
📁 Logos saved to: /path/to/logos
```

## Supported Symbols

The script includes all active trading pairs from Hyperliquid, including:

- Major cryptocurrencies: BTC, ETH, SOL, ADA, DOT, etc.
- DeFi tokens: UNI, AAVE, CRV, LDO, etc.
- Meme coins: DOGE, SHIB, PEPE, BONK, WIF, etc.
- And many more!

## Error Handling

- Failed downloads are logged but don't stop the entire process
- Network timeouts are handled gracefully
- The script provides a final summary of successful and failed downloads

## Rate Limiting

The script includes a 200ms delay between downloads to be respectful to Hyperliquid's servers.

## File Structure

```
zero-light-logo-scrapper/
├── logoScraper.js          # Main script
├── package.json            # NPM configuration
├── README.md              # This file
└── logos/                 # Downloaded logos (created automatically)
    ├── BTC.svg
    ├── ETH.svg
    ├── SOL.svg
    └── ...
```

## Dependencies

- **axios**: For making HTTP requests to download logos
- **fs**: File system operations (built-in Node.js module)
- **path**: Path utilities (built-in Node.js module)

## License

ISC License

## Contributing

Feel free to submit issues and enhancement requests!
# lighter-logos
# lighter-logos
