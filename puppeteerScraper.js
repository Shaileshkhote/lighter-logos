const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const sharp = require('sharp');

// Target URL
const TARGET_URL = 'https://app.lighter.xyz/trade/BNB';

// Function to ensure images directory exists
function ensureImagesDirectory() {
    const imagesDir = path.join(__dirname, 'images');
    if (!fs.existsSync(imagesDir)) {
        fs.mkdirSync(imagesDir, { recursive: true });
        console.log('✅ Created images directory');
    }
    return imagesDir;
}

// Function to download image from URL with better error handling
function downloadImage(url, filepath) {
    return new Promise((resolve, reject) => {
        const protocol = url.startsWith('https') ? https : http;
        
        const request = protocol.get(url, (response) => {
            // Handle redirects
            if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
                return downloadImage(response.headers.location, filepath)
                    .then(resolve)
                    .catch(reject);
            }
            
            if (response.statusCode === 200) {
                const fileStream = fs.createWriteStream(filepath);
                response.pipe(fileStream);
                
                fileStream.on('finish', () => {
                    fileStream.close();
                    resolve(true);
                });
                
                fileStream.on('error', (err) => {
                    fs.unlinkSync(filepath); // Delete the file on error
                    reject(err);
                });
            } else {
                reject(new Error(`Failed to download: ${response.statusCode}`));
            }
        });
        
        request.on('error', reject);
        request.setTimeout(10000, () => {
            request.destroy();
            reject(new Error('Download timeout'));
        });
    });
}

// Function to extract and save ALL images from table data
async function extractAllImages(tableData, outputDir) {
    try {
        console.log('🖼️ Extracting all images from table data...');
        
        const allImages = [];
        let imageCounter = 0;
        
        // Extract images from all tables
        tableData.tables.forEach((table, tableIndex) => {
            table.rows.forEach((row, rowIndex) => {
                row.cells.forEach((cell, cellIndex) => {
                    // Process all images in this cell
                    cell.images.forEach(img => {
                        imageCounter++;
                        allImages.push({
                            id: imageCounter,
                            tableIndex: tableIndex,
                            rowIndex: rowIndex,
                            cellIndex: cellIndex,
                            src: img.src,
                            alt: img.alt || '',
                            className: img.className,
                            coinName: extractCoinNameFromCell(cell, row)
                        });
                    });
                });
            });
        });
        
        console.log(`📊 Found ${allImages.length} images to extract`);
        
        // Use the main images directory directly
        const imagesSubDir = outputDir;
        
        // Save all images
        let successful = 0;
        let failed = 0;
        const failedImages = [];
        
        for (const imgData of allImages) {
            try {
                const saved = await saveImageFromData(imgData, imagesSubDir);
                if (saved) {
                    successful++;
                } else {
                    failed++;
                    failedImages.push(imgData);
                }
            } catch (error) {
                console.error(`❌ Error saving image ${imgData.id}:`, error.message);
                failed++;
                failedImages.push(imgData);
            }
            
            // Small delay to avoid overwhelming the system
            await new Promise(resolve => setTimeout(resolve, 50));
        }
        
        console.log('\n' + '='.repeat(60));
        console.log('🖼️ IMAGE EXTRACTION COMPLETE!');
        console.log('='.repeat(60));
        console.log(`✅ Successfully saved: ${successful}`);
        console.log(`❌ Failed: ${failed}`);
        if (failedImages.length > 0) {
            console.log(`Failed images: ${failedImages.map(img => img.id).join(', ')}`);
        }
        console.log(`📁 Images saved to: ${imagesSubDir}`);
        console.log('='.repeat(60) + '\n');
        
        // Save image extraction summary
        const imageSummary = {
            timestamp: new Date().toISOString(),
            totalImages: allImages.length,
            successful: successful,
            failed: failed,
            failedImages: failedImages,
            images: allImages.map(img => ({
                id: img.id,
                coinName: img.coinName,
                src: img.src.substring(0, 100) + '...',
                alt: img.alt
            }))
        };
        
        fs.writeFileSync(path.join(outputDir, 'image-extraction-summary.json'), JSON.stringify(imageSummary, null, 2));
        console.log('📊 Image extraction summary saved to: image-extraction-summary.json');
        
    } catch (error) {
        console.error('❌ Error extracting images:', error.message);
    }
}

// Function to extract coin name from cell data
function extractCoinNameFromCell(cell, row) {
    // Try to find coin name in the cell text
    let coinName = '';
    
    // Method 1: Direct text match
    if (cell.text && cell.text.length >= 2 && cell.text.length <= 10 && /^[A-Z0-9]+$/i.test(cell.text)) {
        coinName = cell.text;
    }
    
    // Method 2: Look in child elements
    if (!coinName && cell.children) {
        for (const child of cell.children) {
            if (child.text && child.text.length >= 2 && child.text.length <= 10 && /^[A-Z0-9]+$/i.test(child.text)) {
                coinName = child.text;
                break;
            }
        }
    }
    
    // Method 3: Look in other cells of the same row
    if (!coinName && row.cells) {
        for (const otherCell of row.cells) {
            if (otherCell.text && otherCell.text.length >= 2 && otherCell.text.length <= 10 && /^[A-Z0-9]+$/i.test(otherCell.text)) {
                coinName = otherCell.text;
                break;
            }
        }
    }
    
    return coinName || `image_${Date.now()}`;
}

// Function to save image from various data formats (converted to PNG)
async function saveImageFromData(imgData, outputDir) {
    try {
        const src = imgData.src;
        let filename = '';
        let filepath = '';
        
        // Clean coin name for filename
        const cleanCoinName = imgData.coinName.replace(/[<>:"/\\|?*]/g, '').replace(/\s+/g, '_');
        
        // Always save as PNG
        filename = `${cleanCoinName}.png`;
        filepath = path.join(imagesDir, filename);
        
        // Handle duplicates by adding counter
        let counter = 1;
        while (fs.existsSync(filepath)) {
            filename = `${cleanCoinName}_${counter}.png`;
            filepath = path.join(imagesDir, filename);
            counter++;
        }
        
        if (src.startsWith('data:image/svg+xml')) {
            // SVG data URL - convert to PNG
            const svgMatch = src.match(/^data:image\/svg\+xml[^,]*,(.+)$/);
            if (svgMatch) {
                let svgContent = svgMatch[1];
                if (src.includes('base64')) {
                    svgContent = Buffer.from(svgContent, 'base64').toString('utf8');
                } else {
                    svgContent = decodeURIComponent(svgContent);
                }
                
                // Convert SVG to PNG using sharp
                await sharp(Buffer.from(svgContent))
                    .png()
                    .toFile(filepath);
                
                console.log(`✅ Saved PNG (from SVG): ${filename}`);
                return true;
            }
        } else if (src.startsWith('data:image/')) {
            // Other base64 images - convert to PNG
            const matches = src.match(/^data:image\/([a-zA-Z]+);base64,(.+)$/);
            if (matches) {
                const base64Data = matches[2];
                const imageBuffer = Buffer.from(base64Data, 'base64');
                
                // Convert to PNG using sharp
                await sharp(imageBuffer)
                    .png()
                    .toFile(filepath);
                
                console.log(`✅ Saved PNG (from ${matches[1].toUpperCase()}): ${filename}`);
                return true;
            }
        } else if (src.startsWith('http')) {
            // Remote URL images - download and convert to PNG
            const tempFile = path.join(outputDir, `temp_${Date.now()}.tmp`);
            
            try {
                // Download the image first
                await downloadImage(src, tempFile);
                
                // Convert to PNG using sharp
                await sharp(tempFile)
                    .png()
                    .toFile(filepath);
                
                // Clean up temp file
                fs.unlinkSync(tempFile);
                
                console.log(`✅ Saved PNG (from URL): ${filename}`);
                return true;
                
            } catch (downloadError) {
                // Clean up temp file if it exists
                if (fs.existsSync(tempFile)) {
                    fs.unlinkSync(tempFile);
                }
                throw downloadError;
            }
        } else if (src.startsWith('/assets/') || src.startsWith('./assets/') || src.startsWith('assets/')) {
            // Asset path images - convert to full URL and download
            let fullUrl = src;
            if (src.startsWith('/assets/')) {
                fullUrl = `https://app.lighter.xyz${src}`;
            } else if (src.startsWith('./assets/')) {
                fullUrl = `https://app.lighter.xyz/${src.substring(2)}`;
            } else if (src.startsWith('assets/')) {
                fullUrl = `https://app.lighter.xyz/${src}`;
            }
            
            const tempFile = path.join(outputDir, `temp_${Date.now()}.tmp`);
            
            try {
                console.log(`🔗 Converting asset path to full URL: ${fullUrl}`);
                
                // Download the image first
                await downloadImage(fullUrl, tempFile);
                
                // Convert to PNG using sharp
                await sharp(tempFile)
                    .png()
                    .toFile(filepath);
                
                // Clean up temp file
                fs.unlinkSync(tempFile);
                
                console.log(`✅ Saved PNG (from asset): ${filename}`);
                return true;
                
            } catch (downloadError) {
                // Clean up temp file if it exists
                if (fs.existsSync(tempFile)) {
                    fs.unlinkSync(tempFile);
                }
                console.error(`❌ Failed to download asset ${src}:`, downloadError.message);
                return false;
            }
        }
        
        console.log(`⚠️ Unsupported image format: ${src.substring(0, 50)}...`);
        return false;
        
    } catch (error) {
        console.error(`❌ Failed to save image ${imgData.id}:`, error.message);
        return false;
    }
}

// Function to write table data to CSV format
async function writeTableToCSV(tableData, outputDir) {
    try {
        const csvPath = path.join(outputDir, 'table-data.csv');
        let csvContent = '';
        
        tableData.tables.forEach((table, tableIndex) => {
            csvContent += `\n=== TABLE ${tableIndex + 1} ===\n`;
            
            // Write headers
            if (table.headers.length > 0) {
                const headerRow = table.headers[0].headers.map(h => h.text).join(',');
                csvContent += headerRow + '\n';
            }
            
            // Write data rows
            table.rows.forEach(row => {
                const rowData = row.cells.map(cell => {
                    // Clean text for CSV (remove commas, quotes, newlines)
                    let text = cell.text.replace(/[,]/g, ';').replace(/"/g, '""').replace(/\n/g, ' ');
                    return `"${text}"`;
                }).join(',');
                csvContent += rowData + '\n';
            });
        });
        
        fs.writeFileSync(csvPath, csvContent, 'utf8');
        console.log(`📊 CSV file saved: ${csvPath}`);
        
    } catch (error) {
        console.error('❌ Error writing CSV:', error.message);
    }
}

// Function to write table data to HTML format
async function writeTableToHTML(tableData, outputDir) {
    try {
        const htmlPath = path.join(outputDir, 'lighter-table-data.html');
        let htmlContent = `<!DOCTYPE html>
<html>
<head>
    <title>Lighter Market Data Table</title>
    <style>
        body { 
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; 
            margin: 20px; 
            background-color: #f5f5f5;
        }
        .container {
            max-width: 1200px;
            margin: 0 auto;
            background: white;
            padding: 20px;
            border-radius: 8px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
        h1 { 
            color: #333; 
            text-align: center; 
            margin-bottom: 30px;
            border-bottom: 3px solid #007bff;
            padding-bottom: 10px;
        }
        .info {
            background: #e9ecef;
            padding: 15px;
            border-radius: 5px;
            margin-bottom: 20px;
        }
        table { 
            border-collapse: collapse; 
            width: 100%; 
            margin-bottom: 30px;
            background: white;
        }
        th, td { 
            border: 1px solid #ddd; 
            padding: 12px; 
            text-align: left; 
        }
        th { 
            background-color: #007bff; 
            color: white;
            font-weight: bold;
            text-transform: uppercase;
            font-size: 12px;
            letter-spacing: 0.5px;
        }
        tr:nth-child(even) {
            background-color: #f8f9fa;
        }
        tr:hover {
            background-color: #e3f2fd;
        }
        .coin-image { 
            width: 24px; 
            height: 24px; 
            vertical-align: middle; 
            margin-right: 8px;
            border-radius: 50%;
        }
        .table-title { 
            font-size: 20px; 
            font-weight: bold; 
            margin: 30px 0 15px 0; 
            color: #495057;
            border-left: 4px solid #007bff;
            padding-left: 15px;
        }
        .stats {
            display: flex;
            justify-content: space-around;
            margin: 20px 0;
            text-align: center;
        }
        .stat-item {
            background: #f8f9fa;
            padding: 15px;
            border-radius: 5px;
            flex: 1;
            margin: 0 10px;
        }
        .stat-number {
            font-size: 24px;
            font-weight: bold;
            color: #007bff;
        }
        .stat-label {
            color: #6c757d;
            font-size: 14px;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>🚀 Lighter Market Data</h1>
        
        <div class="info">
            <strong>Generated:</strong> ${new Date().toLocaleString()}<br>
            <strong>Source:</strong> https://app.lighter.xyz/<br>
            <strong>Tables Found:</strong> ${tableData.debug.tableCount}<br>
            <strong>Total Elements:</strong> ${tableData.debug.totalElements}
        </div>
        
        <div class="stats">
            <div class="stat-item">
                <div class="stat-number">${tableData.debug.tableCount}</div>
                <div class="stat-label">Tables</div>
            </div>
            <div class="stat-item">
                <div class="stat-number">${tableData.tables.reduce((sum, table) => sum + (table.rows ? table.rows.length : 0), 0)}</div>
                <div class="stat-label">Rows</div>
            </div>
            <div class="stat-item">
                <div class="stat-number">${tableData.debug.totalElements}</div>
                <div class="stat-label">Elements</div>
            </div>
        </div>
`;
        
        tableData.tables.forEach((table, tableIndex) => {
            htmlContent += `        <div class="table-title">📊 Table ${tableIndex + 1}</div>
        <table>
`;
            
            // Write headers
            if (table.headers.length > 0) {
                htmlContent += '            <thead><tr>\n';
                table.headers[0].headers.forEach(header => {
                    htmlContent += `                <th>${header.text}</th>\n`;
                });
                htmlContent += '            </tr></thead>\n';
            }
            
            // Write body
            htmlContent += '            <tbody>\n';
            table.rows.forEach((row, rowIndex) => {
                htmlContent += '                <tr>\n';
                row.cells.forEach(cell => {
                    let cellContent = cell.text || '';
                    
                    // Add images if present
                    if (cell.images.length > 0) {
                        cellContent = cell.images.map(img => 
                            `<img src="${img.src}" alt="${img.alt || ''}" class="coin-image">`
                        ).join('') + cellContent;
                    }
                    
                    // Escape HTML characters
                    cellContent = cellContent.replace(/</g, '&lt;').replace(/>/g, '&gt;');
                    
                    htmlContent += `                    <td>${cellContent}</td>\n`;
                });
                htmlContent += '                </tr>\n';
            });
            htmlContent += '            </tbody>\n';
            htmlContent += '        </table>\n\n';
        });
        
        htmlContent += `    </div>
</body>
</html>`;
        
        fs.writeFileSync(htmlPath, htmlContent, 'utf8');
        console.log(`📊 HTML table file saved: ${htmlPath}`);
        
    } catch (error) {
        console.error('❌ Error writing HTML:', error.message);
    }
}

// Function to write table data to text format
async function writeTableToText(tableData, outputDir) {
    try {
        const txtPath = path.join(outputDir, 'table-data.txt');
        let textContent = `LIGHTER MARKET DATA TABLE\n`;
        textContent += `Generated: ${new Date().toLocaleString()}\n`;
        textContent += `Total Tables: ${tableData.debug.tableCount}\n`;
        textContent += `Total Elements: ${tableData.debug.totalElements}\n`;
        textContent += `${'='.repeat(80)}\n\n`;
        
        tableData.tables.forEach((table, tableIndex) => {
            textContent += `TABLE ${tableIndex + 1}\n`;
            textContent += `${'-'.repeat(40)}\n`;
            
            // Write headers
            if (table.headers.length > 0) {
                const headers = table.headers[0].headers.map(h => h.text);
                textContent += headers.join(' | ') + '\n';
                textContent += headers.map(() => '---').join(' | ') + '\n';
            }
            
            // Write data rows
            table.rows.forEach(row => {
                const rowData = row.cells.map(cell => {
                    // Truncate long text for readability
                    let text = cell.text;
                    if (text.length > 20) {
                        text = text.substring(0, 17) + '...';
                    }
                    return text.padEnd(20);
                }).join(' | ');
                textContent += rowData + '\n';
            });
            
            textContent += '\n';
        });
        
        fs.writeFileSync(txtPath, textContent, 'utf8');
        console.log(`📊 Text file saved: ${txtPath}`);
        
    } catch (error) {
        console.error('❌ Error writing text file:', error.message);
    }
}

// Function to save SVG or image
async function saveLogoToFile(logoData, coinName, imagesDir) {
    try {
        // Clean the coin name - remove any invalid filename characters
        const cleanName = coinName.trim()
            .replace(/[<>:"/\\|?*]/g, '') // Remove invalid filename chars
            .replace(/\s+/g, '_'); // Replace spaces with underscores
        
        if (!cleanName) {
            console.log(`⚠️ Skipping invalid coin name: ${coinName}`);
            return false;
        }

        // Determine if it's SVG or other format
        if (logoData.type === 'svg') {
            const filename = `${cleanName}.svg`;
            const filepath = path.join(imagesDir, filename);
            fs.writeFileSync(filepath, logoData.content, 'utf8');
            console.log(`✅ Saved SVG: ${filename}`);
            return true;
        } else if (logoData.type === 'svg-data') {
            // SVG embedded as data URL
            const filename = `${cleanName}.svg`;
            const filepath = path.join(imagesDir, filename);
            
            // Decode the SVG from data URL
            const svgMatch = logoData.content.match(/^data:image\/svg\+xml[^,]*,(.+)$/);
            if (svgMatch) {
                let svgContent = svgMatch[1];
                // Decode if it's base64
                if (logoData.content.includes('base64')) {
                    svgContent = Buffer.from(svgContent, 'base64').toString('utf8');
                } else {
                    // URL decode
                    svgContent = decodeURIComponent(svgContent);
                }
                fs.writeFileSync(filepath, svgContent, 'utf8');
                console.log(`✅ Saved SVG (from data URL): ${filename}`);
                return true;
            }
        } else if (logoData.type === 'url') {
            // Determine extension from URL or default to png
            const urlExt = logoData.content.match(/\.(png|jpg|jpeg|gif|webp|svg)(\?|$)/i);
            const ext = urlExt ? urlExt[1].toLowerCase() : 'png';
            const filename = `${cleanName}.${ext}`;
            const filepath = path.join(imagesDir, filename);
            
            // Skip if file already exists
            if (fs.existsSync(filepath)) {
                console.log(`⏩ Already exists: ${filename}`);
                return true;
            }
            
            await downloadImage(logoData.content, filepath);
            console.log(`✅ Downloaded image: ${filename}`);
            return true;
        } else if (logoData.type === 'base64') {
            // Handle base64 encoded images
            const matches = logoData.content.match(/^data:image\/([a-zA-Z]+);base64,(.+)$/);
            if (matches) {
                const ext = matches[1].toLowerCase();
                const base64Data = matches[2];
                const filename = `${cleanName}.${ext}`;
                const filepath = path.join(imagesDir, filename);
                
                fs.writeFileSync(filepath, Buffer.from(base64Data, 'base64'));
                console.log(`✅ Saved base64 image: ${filename}`);
                return true;
            }
        }
        
        return false;
    } catch (error) {
        console.error(`❌ Failed to save ${coinName}:`, error.message);
        return false;
    }
}

// Main scraping function
async function scrapeLighterLogos() {
    let browser;
    const imagesDir = ensureImagesDirectory();
    
    try {
        console.log('🚀 Launching browser...');
        browser = await puppeteer.launch({
            headless: false, // Set to true for production
            defaultViewport: { width: 1920, height: 1080 },
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-web-security',
                '--disable-features=IsolateOrigins,site-per-process'
            ]
        });

        const page = await browser.newPage();
        
        // Set user agent
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        
        console.log(`📡 Navigating to ${TARGET_URL}...`);
        await page.goto(TARGET_URL, { 
            waitUntil: 'networkidle2',
            timeout: 60000 
        });

        // Wait for initial page load
        await new Promise(resolve => setTimeout(resolve, 3000));

        console.log('🔍 Looking for market selector button...');
        
        // Click the specific button using the data-tourid attribute
        const buttonSelector = 'button[data-tourid="marketSelector"]';
        await page.waitForSelector(buttonSelector, { timeout: 10000 });
        
        console.log('🖱️ Clicking market selector button...');
        await page.click(buttonSelector);
        
        // Wait for dropdown/dialog to open
        await new Promise(resolve => setTimeout(resolve, 2000));

        console.log('⏳ Waiting for coin list to load...');
        
        // Wait for the dialog or list to appear
        try {
            await page.waitForSelector('[role="dialog"], [data-state="open"], .modal', { timeout: 10000 });
        } catch (e) {
            console.log('⚠️ Dialog selector not found, continuing anyway...');
        }
        
        // Additional wait to ensure all items are rendered
        await new Promise(resolve => setTimeout(resolve, 3000));

        // Save the complete table HTML after modal is open
        await saveCompleteTableHTML(page, __dirname);
        
        // Process table rows and save images
        console.log('\n🔄 Processing table data and saving images...');
        await processTableRowsAndSaveImages(path.join(__dirname, 'table-data.json'), __dirname);
        
        // Extract all coins with their logos and names from the table body
//         const coinData = await page.evaluate(() => {
//             const coins = [];
            
//             console.log('=== DEBUG: Starting extraction ===');
            
//             // Find the modal/dialog/dropdown
//             const modal = document.querySelector('[role="dialog"]') || 
//                          document.querySelector('[data-state="open"]') ||
//                          document.querySelector('.modal') ||
//                          document.querySelector('[aria-modal="true"]');
            
//             if (!modal) {
//                 console.log('No modal found, searching entire document');
//             }
            
//             const searchContainer = modal || document.body;

// const table = document.querySelectorAll('table');
//             console.log("🚀 ~ scrapeLighterLogos ~ table:", table)
            
//             // Look specifically for table body
//             const tableBody = searchContainer.querySelector('tbody');
            
//             if (tableBody) {
//                 console.log('✅ Found table body');
                
//                 // Get all rows in the table body
//                 const rows = tableBody.querySelectorAll('tr');
//                 console.log(`Found ${rows.length} rows in table body`);
                
//                 rows.forEach((row, rowIndex) => {
//                     try {
//                         // Find the image in this row
//                         const img = row.querySelector('img');
                        
//                         if (!img || !img.src) {
//                             console.log(`Row ${rowIndex}: No image found`);
//                             return;
//                         }
                        
//                         console.log(`Row ${rowIndex}: Found image - ${img.src.substring(0, 50)}...`);
                        
//                         // Find the p tag with coin name in the same row
//                         let coinName = '';
                        
//                         // Method 1: Direct p tag in the row
//                         const pTags = row.querySelectorAll('p');
//                         for (const p of pTags) {
//                             const text = p.textContent.trim();
//                             // Assuming coin symbols are typically 2-10 characters
//                             if (text && text.length >= 2 && text.length <= 10 && /^[A-Z0-9]+$/i.test(text)) {
//                                 coinName = text;
//                                 console.log(`Found coin name: ${coinName}`);
//                                 break;
//                             }
//                         }
                        
//                         // Method 2: If no direct p tag, look in cells
//                         if (!coinName) {
//                             const cells = row.querySelectorAll('td');
//                             for (const cell of cells) {
//                                 const p = cell.querySelector('p');
//                                 if (p) {
//                                     const text = p.textContent.trim();
//                                     if (text && text.length >= 2 && text.length <= 10 && /^[A-Z0-9]+$/i.test(text)) {
//                                         coinName = text;
//                                         console.log(`Found coin name in cell: ${coinName}`);
//                                         break;
//                                     }
//                                 }
//                             }
//                         }
                        
//                         // Method 3: Get text content from the cell next to image cell
//                         if (!coinName) {
//                             const imgCell = img.closest('td');
//                             if (imgCell) {
//                                 const nextCell = imgCell.nextElementSibling;
//                                 if (nextCell) {
//                                     const text = nextCell.textContent.trim();
//                                     // Extract first word that looks like a coin symbol
//                                     const match = text.match(/\b([A-Z0-9]{2,10})\b/i);
//                                     if (match) {
//                                         coinName = match[1];
//                                         console.log(`Found coin name from next cell: ${coinName}`);
//                                     }
//                                 }
//                             }
//                         }
                        
//                         if (!coinName) {
//                             console.log(`Row ${rowIndex}: Could not find coin name`);
//                             return;
//                         }
                        
//                         // Determine logo data type
//                         let logoData = null;
//                         const src = img.src;
                        
//                         if (src.startsWith('data:image/svg+xml')) {
//                             logoData = { type: 'svg-data', content: src };
//                         } else if (src.startsWith('data:')) {
//                             logoData = { type: 'base64', content: src };
//                         } else {
//                             logoData = { type: 'url', content: src };
//                         }
                        
//                         coins.push({
//                             name: coinName.toUpperCase(), // Normalize to uppercase
//                             logo: logoData
//                         });
                        
//                         console.log(`✓ Added: ${coinName}`);
                        
//                     } catch (error) {
//                         console.error(`Error processing row ${rowIndex}:`, error);
//                     }
//                 });
//             } else {
//                 console.log('⚠️ No table body found, falling back to image search');
                
//                 // Fallback: Find all images in the modal
//                 const allImages = searchContainer.querySelectorAll('img');
//                 console.log(`Found ${allImages.length} images total`);
                
//                 allImages.forEach((img, index) => {
//                     try {
//                         if (!img.src) return;
                        
//                         // Try to find associated text
//                         let coinName = '';
//                         const parent = img.closest('div, button, a, li');
                        
//                         if (parent) {
//                             const pTags = parent.querySelectorAll('p');
//                             for (const p of pTags) {
//                                 const text = p.textContent.trim();
//                                 if (text && text.length >= 2 && text.length <= 10 && /^[A-Z0-9]+$/i.test(text)) {
//                                     coinName = text;
//                                     break;
//                                 }
//                             }
//                         }
                        
//                         if (coinName) {
//                             let logoData = null;
//                             const src = img.src;
                            
//                             if (src.startsWith('data:image/svg+xml')) {
//                                 logoData = { type: 'svg-data', content: src };
//                             } else if (src.startsWith('data:')) {
//                                 logoData = { type: 'base64', content: src };
//                             } else {
//                                 logoData = { type: 'url', content: src };
//                             }
                            
//                             coins.push({
//                                 name: coinName.toUpperCase(),
//                                 logo: logoData
//                             });
//                         }
//                     } catch (error) {
//                         console.error(`Error processing image ${index}:`, error);
//                     }
//                 });
//             }
            
//             // Remove duplicates
//             const uniqueCoins = [];
//             const seenNames = new Set();
            
//             for (const coin of coins) {
//                 if (!seenNames.has(coin.name)) {
//                     seenNames.add(coin.name);
//                     uniqueCoins.push(coin);
//                 }
//             }
            
//             console.log('=== DEBUG: Extraction complete ===');
//             console.log(`Found ${uniqueCoins.length} unique coins`);
            
//             return uniqueCoins;
//         });

//         console.log(`\n📈 Found ${coinData.length} coins\n`);
        
//         // Extract comprehensive table data for analysis
//         console.log('🔍 Extracting complete table structure...');
//         const fullTableData = await page.evaluate(() => {
//             const result = {
//                 tables: [],
//                 allElements: [],
//                 modalInfo: {},
//                 debug: {}
//             };
            
//             // Find modal
//             const modal = document.querySelector('[role="dialog"]') || 
//                          document.querySelector('[data-state="open"]') ||
//                          document.querySelector('.modal') ||
//                          document.querySelector('[aria-modal="true"]') ||
//                          document.querySelector('[data-radix-popper-content-wrapper]');
            
//             result.modalInfo.found = !!modal;
//             result.modalInfo.className = modal?.className || 'none';
//             result.modalInfo.id = modal?.id || 'none';
            
//             const container = modal || document.body;
            
//             // Extract all tables
//             const tables = container.querySelectorAll('table');
//             result.debug.tableCount = tables.length;
            
//             tables.forEach((table, tableIndex) => {
//                 const tableData = {
//                     index: tableIndex,
//                     className: table.className,
//                     id: table.id,
//                     headers: [],
//                     rows: [],
//                     allCells: []
//                 };
                
//                 // Extract headers
//                 const thead = table.querySelector('thead');
//                 if (thead) {
//                     const headerRows = thead.querySelectorAll('tr');
//                     headerRows.forEach((row, rowIndex) => {
//                         const headers = Array.from(row.querySelectorAll('th, td')).map(cell => ({
//                             text: cell.textContent.trim(),
//                             className: cell.className,
//                             tagName: cell.tagName
//                         }));
//                         tableData.headers.push({ rowIndex, headers });
//                     });
//                 }
                
//                 // Extract body rows
//                 const tbody = table.querySelector('tbody');
//                 console.log("🚀 ~ scrapeLighterLogos ~ tbody:", tbody)
//                 if (tbody) {
//                     const rows = tbody.querySelectorAll('tr');
//                     console.log("🚀 ~ scrapeLighterLogos ~ rows:", rows)
//                     tableData.rowCount = rows.length;
                    
//                     rows.forEach((row, rowIndex) => {
//                         const rowData = {
//                             index: rowIndex,
//                             className: row.className,
//                             cells: []
//                         };
                        
//                         const cells = row.querySelectorAll('td, th');
//                         cells.forEach((cell, cellIndex) => {
//                             const cellData = {
//                                 index: cellIndex,
//                                 text: cell.textContent.trim(),
//                                 className: cell.className,
//                                 tagName: cell.tagName,
//                                 images: [],
//                                 children: []
//                             };
                            
//                             // Extract images in cell
//                             const images = cell.querySelectorAll('img');
//                             images.forEach(img => {
//                                 if (img.src) {
//                                     cellData.images.push({
//                                         src: img.src,
//                                         alt: img.alt || '',
//                                         className: img.className
//                                     });
//                                 }
//                             });
                            
//                             // Extract child elements
//                             const children = cell.querySelectorAll('*');
//                             children.forEach(child => {
//                                 if (child.tagName !== 'IMG') {
//                                     cellData.children.push({
//                                         tagName: child.tagName,
//                                         text: child.textContent.trim(),
//                                         className: child.className
//                                     });
//                                 }
//                             });
                            
//                             rowData.cells.push(cellData);
//                             tableData.allCells.push(cellData);
//                         });
                        
//                         tableData.rows.push(rowData);
//                     });
//                 }
                
//                 result.tables.push(tableData);
//             });
            
//             // Extract all elements in modal for debugging
//             const allElements = container.querySelectorAll('*');
//             result.debug.totalElements = allElements.length;
            
//             // Get unique element types
//             const elementTypes = new Set();
//             allElements.forEach(el => elementTypes.add(el.tagName));
//             result.debug.elementTypes = Array.from(elementTypes);
            
//             return result;
//         });
        
        // Save comprehensive table data
        // fs.writeFileSync('table-structure.json', JSON.stringify(fullTableData, null, 2));
        // console.log('📊 Complete table structure saved to: table-structure.json');
        // console.log(`📈 Found ${fullTableData.debug.tableCount} tables`);
        // console.log(`📈 Found ${fullTableData.debug.totalElements} total elements`);
        // console.log(`📈 Element types: ${fullTableData.debug.elementTypes.join(', ')}`);
        
        // Write table data to HTML file in root directory
        // await writeTableToHTML(fullTableData, __dirname);
        
        // Extract and save ALL images from table data
        // await extractAllImages(fullTableData, imagesDir);
        
        // Also extract base64 images from HTML content
        // await extractBase64FromHTML(__dirname, imagesDir);
        
        // Extract SVG elements from the complete page HTML
        // await extractSVGsFromCompletePage(__dirname, imagesDir);
        
        // Extract first cell data from modal tbody
        // await extractFirstCellDataFromModal(__dirname);

        // // Save all logos
        // let successful = 0;
        // let failed = 0;
        // const failedCoins = [];

        // for (let i = 0; i < coinData.length; i++) {
        //     const coin = coinData[i];
        //     console.log(`\n🪙 Processing ${i + 1}/${coinData.length}: ${coin.name}`);
            
        //     try {
        //         const saved = await saveLogoToFile(coin.logo, coin.name, imagesDir);
        //         if (saved) {
        //             successful++;
        //         } else {
        //             failed++;
        //             failedCoins.push(coin.name);
        //         }
        //     } catch (error) {
        //         console.error(`❌ Error saving ${coin.name}:`, error.message);
        //         failed++;
        //         failedCoins.push(coin.name);
        //     }
            
        //     // Small delay to avoid overwhelming the system
        //     await new Promise(resolve => setTimeout(resolve, 100));
        // }

        // console.log('\n' + '='.repeat(60));
        // console.log('🎉 SCRAPING COMPLETE!');
        // console.log('='.repeat(60));
        // console.log(`✅ Successfully saved: ${successful}`);
        // console.log(`❌ Failed: ${failed}`);
        // if (failedCoins.length > 0) {
        //     console.log(`Failed coins: ${failedCoins.join(', ')}`);
        // }
        // console.log(`📁 Images saved to: ${imagesDir}`);
        // console.log('='.repeat(60) + '\n');

    } catch (error) {
        console.error('\n❌ SCRAPING FAILED:', error.message);
        console.error('Stack trace:', error.stack);
        throw error;
    } finally {
        if (browser) {
            console.log('\n🔒 Closing browser...');
            await browser.close();
            console.log('✅ Browser closed');
        }
    }
}

// Function to extract base64 images from HTML content
async function extractBase64FromHTML(htmlDir, outputDir) {
    try {
        console.log('🔍 Scanning HTML content for additional base64 images...');
        
        const htmlPath = path.join(htmlDir, 'lighter-table-data.html');
        if (!fs.existsSync(htmlPath)) {
            console.log('⚠️ HTML file not found, skipping base64 extraction');
            return;
        }
        
        const htmlContent = fs.readFileSync(htmlPath, 'utf8');
        
        // Find all image patterns (base64 and asset paths)
        const imagePatterns = [
            // Base64 patterns
            /data:image\/(png|jpg|jpeg|gif|webp|svg\+xml);base64,([A-Za-z0-9+/=]+)/g,
            /data:image\/(png|jpg|jpeg|gif|webp|svg\+xml),([^"'\s>]+)/g,
            // Asset path patterns
            /src=["']([^"']*\/assets\/[^"']*\.(png|jpg|jpeg|gif|webp|svg))["']/gi,
            /src=["']([^"']*\/assets\/[^"']*)["']/gi
        ];
        
        const foundImages = [];
        let imageCounter = 0;
        
        imagePatterns.forEach((pattern, patternIndex) => {
            let match;
            while ((match = pattern.exec(htmlContent)) !== null) {
                imageCounter++;
                
                // Try to find the coin name near this image in the HTML
                const coinName = extractCoinNameFromHTMLContext(htmlContent, match.index);
                
                if (patternIndex < 2) {
                    // Base64 patterns
                    foundImages.push({
                        id: imageCounter,
                        type: 'base64',
                        format: match[1],
                        data: match[2],
                        fullMatch: match[0],
                        coinName: coinName,
                        position: match.index
                    });
                } else {
                    // Asset path patterns
                    foundImages.push({
                        id: imageCounter,
                        type: 'asset',
                        src: match[1],
                        fullMatch: match[0],
                        coinName: coinName,
                        position: match.index
                    });
                }
            }
        });
        
        console.log(`📊 Found ${foundImages.length} additional images in HTML`);
        
        if (foundImages.length === 0) {
            console.log('✅ No additional images found');
            return;
        }
        
        // Use the main images directory directly
        const imagesDir = outputDir;
        
        // Save all images with coin names
        let successful = 0;
        let failed = 0;
        
        for (const imgData of foundImages) {
            try {
                // Clean coin name for filename
                const cleanCoinName = imgData.coinName.replace(/[<>:"/\\|?*]/g, '').replace(/\s+/g, '_');
                const filename = `${cleanCoinName}.png`;
                const filepath = path.join(imagesDir, filename);
                
                // Handle duplicates by adding counter
                let counter = 1;
                let finalFilepath = filepath;
                while (fs.existsSync(finalFilepath)) {
                    const finalFilename = `${cleanCoinName}_${counter}.png`;
                    finalFilepath = path.join(imagesDir, finalFilename);
                    counter++;
                }
                
                if (imgData.type === 'base64') {
                    // Decode base64 data and convert to PNG
                    const imageBuffer = Buffer.from(imgData.data, 'base64');
                    await sharp(imageBuffer)
                        .png()
                        .toFile(finalFilepath);
                    
                    console.log(`✅ Saved PNG (from ${imgData.format.toUpperCase()}): ${path.basename(finalFilepath)}`);
                } else if (imgData.type === 'asset') {
                    // Download asset image and convert to PNG
                    let fullUrl = imgData.src;
                    if (imgData.src.startsWith('/assets/')) {
                        fullUrl = `https://app.lighter.xyz${imgData.src}`;
                    } else if (imgData.src.startsWith('./assets/')) {
                        fullUrl = `https://app.lighter.xyz/${imgData.src.substring(2)}`;
                    } else if (imgData.src.startsWith('assets/')) {
                        fullUrl = `https://app.lighter.xyz/${imgData.src}`;
                    }
                    
                    const tempFile = path.join(imagesDir, `temp_${Date.now()}.tmp`);
                    
                    try {
                        console.log(`🔗 Downloading asset: ${fullUrl}`);
                        await downloadImage(fullUrl, tempFile);
                        
                        await sharp(tempFile)
                            .png()
                            .toFile(finalFilepath);
                        
                        fs.unlinkSync(tempFile);
                        console.log(`✅ Saved PNG (from asset): ${path.basename(finalFilepath)}`);
                    } catch (downloadError) {
                        if (fs.existsSync(tempFile)) {
                            fs.unlinkSync(tempFile);
                        }
                        throw downloadError;
                    }
                }
                
                successful++;
                
            } catch (error) {
                console.error(`❌ Failed to save image ${imgData.id}:`, error.message);
                failed++;
            }
        }
        
        console.log(`\n📊 Image extraction complete: ${successful} saved, ${failed} failed`);
        
        // Save image extraction summary
        const imageSummary = {
            timestamp: new Date().toISOString(),
            totalFound: foundImages.length,
            successful: successful,
            failed: failed,
            images: foundImages.map(img => ({
                id: img.id,
                type: img.type,
                coinName: img.coinName,
                format: img.format || 'unknown',
                src: img.src || 'base64',
                preview: img.fullMatch.substring(0, 100) + '...'
            }))
        };
        
        fs.writeFileSync(path.join(outputDir, 'html-image-extraction-summary.json'), JSON.stringify(imageSummary, null, 2));
        console.log('📊 HTML image extraction summary saved');
        
    } catch (error) {
        console.error('❌ Error extracting base64 images:', error.message);
    }
}

// Function to extract coin name from HTML context around image
function extractCoinNameFromHTMLContext(htmlContent, imagePosition) {
    try {
        // Look for coin name in a window around the image position
        const windowSize = 2000; // Characters before and after
        const start = Math.max(0, imagePosition - windowSize);
        const end = Math.min(htmlContent.length, imagePosition + windowSize);
        const context = htmlContent.substring(start, end);
        
        // Method 1: Look for <p> tags with coin symbols
        const pTagPattern = /<p[^>]*>([A-Z0-9]{2,10})<\/p>/gi;
        let match = pTagPattern.exec(context);
        if (match) {
            return match[1];
        }
        
        // Method 2: Look for text content that looks like coin symbols
        const coinPattern = /\b([A-Z0-9]{2,10})\b/g;
        const matches = [...context.matchAll(coinPattern)];
        
        // Filter out common non-coin words
        const commonWords = ['THE', 'AND', 'FOR', 'WITH', 'FROM', 'THIS', 'THAT', 'WILL', 'CAN', 'NOT', 'BUT', 'YOU', 'ALL', 'ARE', 'WAS', 'ONE', 'HAS', 'HAD', 'HIS', 'HER', 'ITS', 'OUR', 'THEY', 'THEM', 'THESE', 'THOSE'];
        
        for (const match of matches) {
            const coinName = match[1];
            if (!commonWords.includes(coinName) && coinName.length >= 2 && coinName.length <= 10) {
                return coinName;
            }
        }
        
        // Method 3: Look for data-testid attributes with coin names
        const testIdPattern = /data-testid="[^"]*?([A-Z0-9]{2,10})[^"]*?"/gi;
        match = testIdPattern.exec(context);
        if (match) {
            return match[1];
        }
        
        // Fallback: generate unique name
        return `coin_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
        
    } catch (error) {
        console.error('Error extracting coin name from context:', error);
        return `coin_${Date.now()}`;
    }
}

// Function to save the complete table HTML after modal is open
async function saveCompleteTableHTML(page, outputDir) {
    try {
        // Get the complete HTML content of the page
        const pageHTML = await page.content();

        // Extract table body and loop over rows
        const tableData = await page.evaluate(() => {
            // Find the table
            const table = document.querySelector('table');
            if (!table) {
                return null;
            }

            // Find the table body
            const tbody = table.querySelector('tbody');
            if (!tbody) {
                return null;
            }

            // Get all rows from tbody
            const rows = tbody.querySelectorAll('tr');

            const tableRows = [];
            
            // Loop over each row
            rows.forEach((row, index) => {
                const cells = row.querySelectorAll('td, th');
                const firstCell = cells[0];
                
                if (firstCell) {
                    // Extract span elements, img tags, and p tags from the first cell and all nested divs
                    const spanElements = firstCell.querySelectorAll('span');
                    const imgElements = firstCell.querySelectorAll('img');
                    const pElements = firstCell.querySelectorAll('p');
                    
                    const elements = [];
                    let coinName = '';
                    
                    // Add SVG elements from spans that are not inside a button
                    spanElements.forEach(span => {
                        const svgInside = span.querySelector('svg');
                        const isInsideButton = span.closest('button');
                        
                        if (svgInside && !isInsideButton) {
                            // Add only the SVG element
                            elements.push({
                                type: 'svg',
                                html: svgInside.outerHTML
                            });
                        }
                    });
                    
                    // Add img elements
                    imgElements.forEach(img => {
                        elements.push({
                            type: 'img',
                            src: img.src,
                            alt: img.alt,
                            html: img.outerHTML
                        });
                    });
                    
                    // Extract coin name from p elements
                    if (pElements.length > 0) {
                        coinName = pElements[0].textContent.trim();
                    }
                    
                    const rowData = {
                        rowIndex: index,
                        coinName: coinName,
                        elements: elements
                    };
                    tableRows.push(rowData);
                }
            });

            return {
                totalRows: rows.length,
                rows: tableRows,
                tbodyHTML: tbody.outerHTML
            };
        });

        if (tableData) {
            // Save table data as JSON
            const tableDataPath = path.join(outputDir, 'table-data.json');
            fs.writeFileSync(tableDataPath, JSON.stringify(tableData, null, 2), 'utf8');

            // Save table body HTML
            const tbodyHTMLPath = path.join(outputDir, 'table-body.html');
            fs.writeFileSync(tbodyHTMLPath, tableData.tbodyHTML, 'utf8');
        }
        
        // Save complete page HTML
        // const pageHTMLPath = path.join(outputDir, 'complete-page.html');
        // fs.writeFileSync(pageHTMLPath, pageHTML, 'utf8');

        
    } catch (error) {
        console.error('❌ Error saving complete table HTML:', error.message);
    }
}

// Function to process table rows and save images/SVGs
async function processTableRowsAndSaveImages(tableDataPath, outputDir) {
    try {
        // Create images directory
        const imagesDir = path.join(outputDir, 'images');
        if (!fs.existsSync(imagesDir)) {
            fs.mkdirSync(imagesDir, { recursive: true });
        }
        
        // Read the table data JSON
        const tableData = JSON.parse(fs.readFileSync(tableDataPath, 'utf8'));
        
        if (!tableData.rows || tableData.rows.length === 0) {
            console.log('No rows found in table data');
            return;
        }

        console.log(`Processing ${tableData.rows.length} rows...`);
        
        let successful = 0;
        let failed = 0;
        
        for (const row of tableData.rows) {
            const coinName = row.coinName;
            
            if (!coinName) {
                console.log(`⚠️ Skipping row ${row.rowIndex}: No coin name`);
                continue;
            }
            
            console.log(`\n🔄 Processing ${coinName} (row ${row.rowIndex})...`);
            console.log(`📊 Found ${row.elements.length} elements`);
            
            let rowSuccess = false;
            
            // Process each element in the row
            for (const element of row.elements) {
                console.log(`  📝 Processing element type: ${element.type}`);
                try {
                    if (element.type === 'svg') {
                        console.log(`    🎨 Processing SVG element...`);
                        // Save SVG as PNG
                        const cleanCoinName = coinName.replace(/[<>:"/\\|?*]/g, '').replace(/\s+/g, '_');
                        const filename = `${cleanCoinName}.png`;
                        const filepath = path.join(imagesDir, filename);
                        
                        console.log(`    📁 Saving to: ${filepath}`);
                        
                        // Convert SVG to PNG using sharp
                        await sharp(Buffer.from(element.html))
                            .png()
                            .toFile(filepath);
                        
                        console.log(`    ✅ Saved SVG as PNG: ${filename}`);
                        rowSuccess = true;
                        
                    } else if (element.type === 'img') {
                        console.log(`    🖼️ Processing IMG element...`);
                        console.log(`    🔗 Source: ${element.src.substring(0, 50)}...`);
                        // Handle different image types
                        if (element.src.startsWith('data:image/svg+xml')) {
                            console.log(`    🎨 Processing SVG data URL...`);
                            // SVG data URL - convert to PNG
                            const svgMatch = element.src.match(/^data:image\/svg\+xml[^,]*,(.+)$/);
                            if (svgMatch) {
                                let svgContent = svgMatch[1];
                                if (element.src.includes('base64')) {
                                    svgContent = Buffer.from(svgContent, 'base64').toString('utf8');
                                } else {
                                    svgContent = decodeURIComponent(svgContent);
                                }
                                
                                const cleanCoinName = coinName.replace(/[<>:"/\\|?*]/g, '').replace(/\s+/g, '_');
                                const filename = `${cleanCoinName}.png`;
                                const filepath = path.join(imagesDir, filename);
                                
                                await sharp(Buffer.from(svgContent))
                                    .png()
                                    .toFile(filepath);
                                
                                console.log(`✅ Saved SVG data URL as PNG: ${filename}`);
                                rowSuccess = true;
                            }
                        } else if (element.src.startsWith('data:image/')) {
                            console.log(`    📷 Processing base64 image...`);
                            // Other base64 images
                            const matches = element.src.match(/^data:image\/([a-zA-Z]+);base64,(.+)$/);
                            if (matches) {
                                const base64Data = matches[2];
                                const cleanCoinName = coinName.replace(/[<>:"/\\|?*]/g, '').replace(/\s+/g, '_');
                                const filename = `${cleanCoinName}.png`;
                                const filepath = path.join(imagesDir, filename);
                                
                                const imageBuffer = Buffer.from(base64Data, 'base64');
                                await sharp(imageBuffer)
                                    .png()
                                    .toFile(filepath);
                                
                                console.log(`✅ Saved base64 image as PNG: ${filename}`);
                                rowSuccess = true;
                            }
                        } else if (element.src.startsWith('http')) {
                            console.log(`    🌐 Processing HTTP asset link...`);
                            // Asset link - download and save
                            const cleanCoinName = coinName.replace(/[<>:"/\\|?*]/g, '').replace(/\s+/g, '_');
                            const filename = `${cleanCoinName}.png`;
                            const filepath = path.join(imagesDir, filename);
                            
                            // Download image
                            const response = await fetch(element.src);
                            const imageBuffer = await response.arrayBuffer();
                            
                            await sharp(Buffer.from(imageBuffer))
                                .png()
                                .toFile(filepath);
                            
                            console.log(`✅ Downloaded and saved asset: ${filename}`);
                            rowSuccess = true;
                        }
                    }
                } catch (error) {
                    console.error(`❌ Failed to save ${element.type} for ${coinName}:`, error.message);
                }
            }
            
            if (rowSuccess) {
                successful++;
                console.log(`✅ ${coinName} - Saved successfully`);
            } else {
                failed++;
                console.log(`❌ ${coinName} - No images saved`);
            }
        }
        
        console.log(`\n📊 Processing complete: ${successful} successful, ${failed} failed`);
        
    } catch (error) {
        console.error('❌ Error processing table rows:', error.message);
    }
}

// Function to extract SVG elements from complete page HTML
async function extractSVGsFromCompletePage(htmlDir, outputDir) {
    try {
        console.log('🎨 Extracting SVG elements from complete page HTML...');
        
        const htmlPath = path.join(htmlDir, 'complete-page.html');
        if (!fs.existsSync(htmlPath)) {
            console.log('⚠️ Complete page HTML not found, skipping SVG extraction');
            return;
        }
        
        const htmlContent = fs.readFileSync(htmlPath, 'utf8');
        
        // Find all SVG elements in the HTML
        const svgPattern = /<svg[^>]*>[\s\S]*?<\/svg>/gi;
        const svgMatches = [...htmlContent.matchAll(svgPattern)];
        
        console.log(`📊 Found ${svgMatches.length} SVG elements in complete page`);
        
        if (svgMatches.length === 0) {
            console.log('✅ No SVG elements found in complete page');
            return;
        }
        
        // Extract SVGs with context to find coin names
        const svgData = [];
        
        svgMatches.forEach((match, index) => {
            const svgContent = match[0];
            const svgPosition = match.index;
            
            // Try to find coin name near this SVG
            const coinName = extractCoinNameFromSVGContext(htmlContent, svgPosition);
            
            svgData.push({
                id: index + 1,
                svgContent: svgContent,
                coinName: coinName,
                position: svgPosition
            });
        });
        
        // Save all SVG elements as PNG
        let successful = 0;
        let failed = 0;
        
        for (const svg of svgData) {
            try {
                // Clean coin name for filename
                const cleanCoinName = svg.coinName.replace(/[<>:"/\\|?*]/g, '').replace(/\s+/g, '_');
                const filename = `${cleanCoinName}.png`;
                const filepath = path.join(imagesDir, filename);
                
                // Handle duplicates by adding counter
                let counter = 1;
                let finalFilepath = filepath;
                while (fs.existsSync(finalFilepath)) {
                    const finalFilename = `${cleanCoinName}_${counter}.png`;
                    finalFilepath = path.join(imagesDir, finalFilename);
                    counter++;
                }
                
                // Convert SVG to PNG using sharp
                await sharp(Buffer.from(svg.svgContent))
                    .png()
                    .toFile(finalFilepath);
                
                console.log(`✅ Saved PNG (from SVG): ${path.basename(finalFilepath)}`);
                successful++;
                
            } catch (error) {
                console.error(`❌ Failed to save SVG ${svg.id}:`, error.message);
                failed++;
            }
        }
        
        console.log(`\n📊 SVG extraction complete: ${successful} saved, ${failed} failed`);
        
        // Save SVG extraction summary
        const svgSummary = {
            timestamp: new Date().toISOString(),
            totalFound: svgData.length,
            successful: successful,
            failed: failed,
            svgs: svgData.map(svg => ({
                id: svg.id,
                coinName: svg.coinName,
                position: svg.position,
                preview: svg.svgContent.substring(0, 100) + '...'
            }))
        };
        
        fs.writeFileSync(path.join(outputDir, 'svg-extraction-summary.json'), JSON.stringify(svgSummary, null, 2));
        console.log('📊 SVG extraction summary saved');
        
    } catch (error) {
        console.error('❌ Error extracting SVG elements:', error.message);
    }
}

// Function to extract coin name from HTML context around SVG
function extractCoinNameFromSVGContext(htmlContent, svgPosition) {
    try {
        // Look for coin name in a window around the SVG position
        const windowSize = 1000; // Characters before and after
        const start = Math.max(0, svgPosition - windowSize);
        const end = Math.min(htmlContent.length, svgPosition + windowSize);
        const context = htmlContent.substring(start, end);
        
        // Method 1: Look for <p> tags with coin symbols near the SVG
        const pTagPattern = /<p[^>]*>([A-Z0-9]{2,10})<\/p>/gi;
        let match = pTagPattern.exec(context);
        if (match) {
            return match[1];
        }
        
        // Method 2: Look for text content that looks like coin symbols
        const coinPattern = /\b([A-Z0-9]{2,10})\b/g;
        const matches = [...context.matchAll(coinPattern)];
        
        // Filter out common non-coin words
        const commonWords = ['THE', 'AND', 'FOR', 'WITH', 'FROM', 'THIS', 'THAT', 'WILL', 'CAN', 'NOT', 'BUT', 'YOU', 'ALL', 'ARE', 'WAS', 'ONE', 'HAS', 'HAD', 'HIS', 'HER', 'ITS', 'OUR', 'THEY', 'THEM', 'THESE', 'THOSE', 'HTML', 'CSS', 'SVG', 'XML', 'HTTP', 'HTTPS', 'WWW', 'COM', 'ORG', 'NET'];
        
        for (const match of matches) {
            const coinName = match[1];
            if (!commonWords.includes(coinName) && coinName.length >= 2 && coinName.length <= 10) {
                return coinName;
            }
        }
        
        // Method 3: Look for data-testid attributes with coin names
        const testIdPattern = /data-testid="[^"]*?([A-Z0-9]{2,10})[^"]*?"/gi;
        match = testIdPattern.exec(context);
        if (match) {
            return match[1];
        }
        
        // Method 4: Look for alt attributes in images near the SVG
        const altPattern = /alt=["']([A-Z0-9]{2,10})["']/gi;
        match = altPattern.exec(context);
        if (match) {
            return match[1];
        }
        
        // Fallback: generate unique name
        return `svg_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
        
    } catch (error) {
        console.error('Error extracting coin name from SVG context:', error);
        return `svg_${Date.now()}`;
    }
}

// Function to extract first cell data from modal tbody
async function extractFirstCellDataFromModal(htmlDir) {
    try {
        console.log('📋 Extracting first cell data from modal tbody...');
        
        const htmlPath = path.join(htmlDir, 'raw-modal.html');
        if (!fs.existsSync(htmlPath)) {
            console.log('⚠️ Raw modal HTML not found, skipping first cell extraction');
            return;
        }
        
        const htmlContent = fs.readFileSync(htmlPath, 'utf8');
        
        // Find tbody elements in the modal HTML
        const tbodyPattern = /<tbody[^>]*>[\s\S]*?<\/tbody>/gi;
        const tbodyMatches = [...htmlContent.matchAll(tbodyPattern)];
        
        console.log(`📊 Found ${tbodyMatches.length} tbody elements in modal`);
        
        if (tbodyMatches.length === 0) {
            console.log('✅ No tbody elements found in modal');
            return;
        }
        
        // Extract first cell data from each tbody
        const firstCellData = [];
        
        tbodyMatches.forEach((tbodyMatch, tbodyIndex) => {
            const tbodyContent = tbodyMatch[0];
            
            // Find all table rows in this tbody
            const rowPattern = /<tr[^>]*>[\s\S]*?<\/tr>/gi;
            const rowMatches = [...tbodyContent.matchAll(rowPattern)];
            
            console.log(`📊 Tbody ${tbodyIndex + 1}: Found ${rowMatches.length} rows`);
            
            rowMatches.forEach((rowMatch, rowIndex) => {
                const rowContent = rowMatch[0];
                
                // Find the first cell (td) in this row
                const firstCellPattern = /<td[^>]*>([\s\S]*?)<\/td>/i;
                const firstCellMatch = rowContent.match(firstCellPattern);
                
                if (firstCellMatch) {
                    const cellContent = firstCellMatch[1];
                    
                    // Look for the specific structure: div > button + div > 3 children
                    // We want the first 2 children of the inner div
                    const structurePattern = /<div[^>]*>[\s\S]*?<button[^>]*>[\s\S]*?<\/button>[\s\S]*?<div[^>]*>([\s\S]*?)<\/div>[\s\S]*?<\/div>/i;
                    const structureMatch = cellContent.match(structurePattern);
                    
                    let coinName = '';
                    let coinIcon = '';
                    let coinIconType = '';
                    let coinIconSrc = '';
                    
                    if (structureMatch) {
                        const innerDivContent = structureMatch[1];
                        
                        // Find all direct children of the inner div (first 2 only)
                        const childPattern = /<[^>]+>[\s\S]*?<\/[^>]+>/g;
                        const children = [...innerDivContent.matchAll(childPattern)];
                        
                        if (children.length >= 2) {
                            // First child - should contain image/icon/buffer/asset path
                            const firstChild = children[0][0];
                            
                            // Extract image/icon from first child
                            const imgPattern = /<img[^>]*src=["']([^"']*)["'][^>]*>/i;
                            const svgPattern = /<svg[^>]*>[\s\S]*?<\/svg>/i;
                            const dataUrlPattern = /data:image\/[^"'\s>]+/i;
                            
                            if (firstChild.match(imgPattern)) {
                                const imgMatch = firstChild.match(imgPattern);
                                coinIcon = imgMatch[1];
                                coinIconType = 'image';
                                coinIconSrc = imgMatch[1];
                            } else if (firstChild.match(svgPattern)) {
                                const svgMatch = firstChild.match(svgPattern);
                                coinIcon = svgMatch[0];
                                coinIconType = 'svg';
                            } else if (firstChild.match(dataUrlPattern)) {
                                const dataMatch = firstChild.match(dataUrlPattern);
                                coinIcon = dataMatch[0];
                                coinIconType = 'data-url';
                                coinIconSrc = dataMatch[0];
                            } else {
                                // Try to extract any src attribute or content
                                const srcPattern = /src=["']([^"']*)["']/i;
                                const srcMatch = firstChild.match(srcPattern);
                                if (srcMatch) {
                                    coinIcon = srcMatch[1];
                                    coinIconType = 'src-attribute';
                                    coinIconSrc = srcMatch[1];
                                } else {
                                    coinIcon = firstChild;
                                    coinIconType = 'raw-content';
                                }
                            }
                            
                            // Second child - should contain coin name
                            const secondChild = children[1][0];
                            coinName = secondChild
                                .replace(/<[^>]*>/g, '') // Remove HTML tags
                                .replace(/\s+/g, ' ') // Normalize whitespace
                                .trim();
                        }
                    }
                    
                    // Fallback: extract general content if specific structure not found
                    if (!coinName && !coinIcon) {
                        const textContent = cellContent
                            .replace(/<[^>]*>/g, '') // Remove HTML tags
                            .replace(/\s+/g, ' ') // Normalize whitespace
                            .trim();
                        
                        const imagePattern = /<img[^>]*src=["']([^"']*)["'][^>]*>/gi;
                        const imageMatches = [...cellContent.matchAll(imagePattern)];
                        const images = imageMatches.map(match => match[1]);
                        
                        const svgPattern = /<svg[^>]*>[\s\S]*?<\/svg>/gi;
                        const svgMatches = [...cellContent.matchAll(svgPattern)];
                        const svgs = svgMatches.map(match => match[0]);
                        
                        firstCellData.push({
                            tbodyIndex: tbodyIndex + 1,
                            rowIndex: rowIndex + 1,
                            coinName: textContent || '(no coin name)',
                            coinIcon: images[0] || svgs[0] || '(no icon)',
                            coinIconType: images[0] ? 'image' : svgs[0] ? 'svg' : 'none',
                            coinIconSrc: images[0] || '',
                            textContent: textContent,
                            images: images,
                            svgs: svgs,
                            rawCellContent: cellContent,
                            structureFound: false
                        });
                    } else {
                        firstCellData.push({
                            tbodyIndex: tbodyIndex + 1,
                            rowIndex: rowIndex + 1,
                            coinName: coinName || '(no coin name)',
                            coinIcon: coinIcon || '(no icon)',
                            coinIconType: coinIconType || 'none',
                            coinIconSrc: coinIconSrc || '',
                            textContent: coinName,
                            images: coinIconType === 'image' || coinIconType === 'src-attribute' ? [coinIconSrc] : [],
                            svgs: coinIconType === 'svg' ? [coinIcon] : [],
                            rawCellContent: cellContent,
                            structureFound: true
                        });
                    }
                }
            });
        });
        
        console.log(`📊 Extracted ${firstCellData.length} first cell entries`);
        
        // Save first cell data as HTML
        const firstCellHTMLPath = path.join(htmlDir, 'first-cell-data.html');
        const firstCellHTML = `<!DOCTYPE html>
<html>
<head>
    <title>First Cell Data - Lighter Modal</title>
    <style>
        body { 
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; 
            margin: 20px; 
            background-color: #f5f5f5;
        }
        .container {
            max-width: 1200px;
            margin: 0 auto;
            background: white;
            padding: 20px;
            border-radius: 8px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
        h1 { 
            color: #333; 
            text-align: center; 
            margin-bottom: 30px;
            border-bottom: 3px solid #007bff;
            padding-bottom: 10px;
        }
        .info {
            background: #e9ecef;
            padding: 15px;
            border-radius: 5px;
            margin-bottom: 20px;
        }
        .cell-entry {
            margin-bottom: 20px;
            padding: 15px;
            border: 1px solid #ddd;
            border-radius: 5px;
            background: #f8f9fa;
        }
        .cell-header {
            font-weight: bold;
            color: #007bff;
            margin-bottom: 10px;
            font-size: 14px;
        }
        .cell-text {
            margin-bottom: 10px;
            font-size: 16px;
            color: #333;
        }
        .cell-images {
            margin-bottom: 10px;
        }
        .cell-images img {
            width: 24px;
            height: 24px;
            margin-right: 8px;
            border-radius: 50%;
        }
        .cell-svgs {
            margin-bottom: 10px;
        }
        .cell-svgs svg {
            width: 24px;
            height: 24px;
            margin-right: 8px;
        }
        .raw-content {
            background: #f1f1f1;
            padding: 10px;
            border-radius: 3px;
            font-family: monospace;
            font-size: 12px;
            color: #666;
            word-break: break-all;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>📋 First Cell Data - Lighter Modal</h1>
        
        <div class="info">
            <strong>Generated:</strong> ${new Date().toLocaleString()}<br>
            <strong>Source:</strong> Raw Modal HTML<br>
            <strong>Total Entries:</strong> ${firstCellData.length}<br>
            <strong>Tbody Elements:</strong> ${tbodyMatches.length}
        </div>
        
        ${firstCellData.map(entry => `
        <div class="cell-entry">
            <div class="cell-header">
                Tbody ${entry.tbodyIndex} - Row ${entry.rowIndex} ${entry.structureFound ? '✅' : '❌'}
            </div>
            <div class="cell-text">
                <strong>Coin Name:</strong> ${entry.coinName || '(empty)'}
            </div>
            <div class="cell-text">
                <strong>Coin Icon:</strong> ${entry.coinIcon || '(no icon)'}
            </div>
            <div class="cell-text">
                <strong>Icon Type:</strong> ${entry.coinIconType || 'none'}
            </div>
            ${entry.coinIconSrc ? `
            <div class="cell-text">
                <strong>Icon Source:</strong> ${entry.coinIconSrc}
            </div>
            ` : ''}
            ${entry.images.length > 0 ? `
            <div class="cell-images">
                <strong>Images:</strong><br>
                ${entry.images.map(img => `<img src="${img}" alt="coin">`).join('')}
            </div>
            ` : ''}
            ${entry.svgs.length > 0 ? `
            <div class="cell-svgs">
                <strong>SVGs:</strong><br>
                ${entry.svgs.map(svg => svg).join('')}
            </div>
            ` : ''}
            <div class="raw-content">
                <strong>Raw Content:</strong><br>
                ${entry.rawCellContent}
            </div>
        </div>
        `).join('')}
    </div>
</body>
</html>`;
        
        fs.writeFileSync(firstCellHTMLPath, firstCellHTML, 'utf8');
        console.log(`📄 First cell data HTML saved: ${firstCellHTMLPath}`);
        
        // Save first cell data as JSON
        const firstCellJSONPath = path.join(htmlDir, 'first-cell-data.json');
        const firstCellJSON = {
            timestamp: new Date().toISOString(),
            totalEntries: firstCellData.length,
            tbodyCount: tbodyMatches.length,
            entries: firstCellData.map(entry => ({
                tbodyIndex: entry.tbodyIndex,
                rowIndex: entry.rowIndex,
                coinName: entry.coinName,
                coinIcon: entry.coinIcon,
                coinIconType: entry.coinIconType,
                coinIconSrc: entry.coinIconSrc,
                textContent: entry.textContent,
                imageCount: entry.images.length,
                svgCount: entry.svgs.length,
                images: entry.images,
                svgs: entry.svgs,
                rawContentLength: entry.rawCellContent.length,
                structureFound: entry.structureFound
            }))
        };
        
        fs.writeFileSync(firstCellJSONPath, JSON.stringify(firstCellJSON, null, 2), 'utf8');
        console.log(`📄 First cell data JSON saved: ${firstCellJSONPath}`);
        
        // Save raw first cell data as text
        const firstCellTextPath = path.join(htmlDir, 'first-cell-data.txt');
        const firstCellText = firstCellData.map(entry => 
            `Tbody ${entry.tbodyIndex} - Row ${entry.rowIndex}: ${entry.textContent}`
        ).join('\n');
        
        fs.writeFileSync(firstCellTextPath, firstCellText, 'utf8');
        console.log(`📄 First cell data text saved: ${firstCellTextPath}`);
        
    } catch (error) {
        console.error('❌ Error extracting first cell data:', error.message);
    }
}

// Main execution
async function main() {
    try {
        await scrapeLighterLogos();
    } catch (error) {
        console.error('❌ Fatal error:', error.message);
        process.exit(1);
    }
}

// Error handlers
process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Unhandled Rejection:', reason);
    process.exit(1);
});

process.on('uncaughtException', (error) => {
    console.error('❌ Uncaught Exception:', error);
    process.exit(1);
});

// Run the script
if (require.main === module) {
    console.log('\n' + '='.repeat(60));
    console.log('🚀 LIGHTER.XYZ LOGO SCRAPER');
    console.log('='.repeat(60) + '\n');
    main();
}

module.exports = { scrapeLighterLogos };
module.exports = { scrapeLighterLogos };