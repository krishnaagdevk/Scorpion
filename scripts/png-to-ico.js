'use strict';

const fs = require('fs');
const path = require('path');

function convertPngToIco(pngPath, icoPath) {
  const pngBuffer = fs.readFileSync(pngPath);
  
  // ICO header (6 bytes)
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // Reserved. Must always be 0
  header.writeUInt16LE(1, 2); // Specifies image type: 1 for icon (.ICO)
  header.writeUInt16LE(1, 4); // Number of images in file

  // Directory entry (16 bytes)
  const dirEntry = Buffer.alloc(16);
  dirEntry.writeUInt8(0, 0); // 0 means 256px width
  dirEntry.writeUInt8(0, 1); // 0 means 256px height
  dirEntry.writeUInt8(0, 2); // Color count (0 = no color palette)
  dirEntry.writeUInt8(0, 3); // Reserved
  dirEntry.writeUInt16LE(1, 4); // Color planes
  dirEntry.writeUInt16LE(32, 6); // Bits per pixel
  dirEntry.writeUInt32LE(pngBuffer.length, 8); // Size of image data in bytes
  dirEntry.writeUInt32LE(22, 12); // Offset of image data from beginning of ICO file (6 + 16 = 22)

  const icoBuffer = Buffer.concat([header, dirEntry, pngBuffer]);
  fs.writeFileSync(icoPath, icoBuffer);
  console.log(`Converted ${pngPath} -> ${icoPath} (${icoBuffer.length} bytes)`);
}

module.exports = { convertPngToIco };

if (require.main === module) {
  const [,, inputPng, outputIco] = process.argv;
  if (!inputPng || !outputIco) {
    console.error('Usage: node png-to-ico.js <input.png> <output.ico>');
    process.exit(1);
  }
  convertPngToIco(path.resolve(inputPng), path.resolve(outputIco));
}
