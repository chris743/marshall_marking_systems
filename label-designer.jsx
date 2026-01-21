import React, { useState, useCallback, useRef, useEffect } from 'react';
import { 
  Move, Type, BarChart3, QrCode, Trash2, Copy, 
  Settings, Printer, Save, FolderOpen, Plus, 
  AlignLeft, AlignCenter, AlignRight, Bold,
  ChevronDown, Layers, Eye, EyeOff, Lock, Unlock,
  RotateCcw, Download, Upload, Grid3X3, ZoomIn, ZoomOut
} from 'lucide-react';

// ========== CRC16 Voice Pick Code Calculator ==========
const crc16Table = (() => {
  const table = new Uint16Array(256);
  for (let i = 0; i < 256; i++) {
    let crc = i;
    for (let j = 0; j < 8; j++) {
      crc = (crc & 1) ? ((crc >> 1) ^ 0xA001) : (crc >> 1);
    }
    table[i] = crc;
  }
  return table;
})();

function calculateCRC16(str) {
  let crc = 0;
  for (let i = 0; i < str.length; i++) {
    const byte = str.charCodeAt(i) & 0xFF;
    crc = (crc >> 8) ^ crc16Table[(crc ^ byte) & 0xFF];
  }
  return crc;
}

function generateVoicePickCode(gtin, lotNumber, packDate = '') {
  // Combine GTIN + Lot + Date (date is optional)
  const combined = `${gtin}${lotNumber}${packDate}`.toUpperCase();
  const crc = calculateCRC16(combined);
  // Format as XX-XX (last 4 digits split into two pairs)
  const code = crc.toString().padStart(4, '0').slice(-4);
  return `${code.slice(0, 2)}-${code.slice(2)}`;
}

// ========== GS1 Check Digit Calculator ==========
function calculateGS1CheckDigit(digits) {
  const nums = digits.replace(/\D/g, '').split('').map(Number);
  if (nums.length !== 13) return '';
  let sum = 0;
  for (let i = 0; i < 13; i++) {
    sum += nums[i] * (i % 2 === 0 ? 1 : 3);
  }
  return ((10 - (sum % 10)) % 10).toString();
}

function formatGTIN14(companyPrefix, itemRef, indicator = '0') {
  const base = `${indicator}${companyPrefix}${itemRef}`.padEnd(13, '0').slice(0, 13);
  return base + calculateGS1CheckDigit(base);
}

// ========== Barcode SVG Generators ==========
const ENCODINGS = {
  CODE128: {
    START_B: 104, STOP: 106, FNC1: 102,
    patterns: [
      '11011001100', '11001101100', '11001100110', '10010011000', '10010001100',
      '10001001100', '10011001000', '10011000100', '10001100100', '11001001000',
      '11001000100', '11000100100', '10110011100', '10011011100', '10011001110',
      '10111001100', '10011101100', '10011100110', '11001110010', '11001011100',
      '11001001110', '11011100100', '11001110100', '11101101110', '11101001100',
      '11100101100', '11100100110', '11101100100', '11100110100', '11100110010',
      '11011011000', '11011000110', '11000110110', '10100011000', '10001011000',
      '10001000110', '10110001000', '10001101000', '10001100010', '11010001000',
      '11000101000', '11000100010', '10110111000', '10110001110', '10001101110',
      '10111011000', '10111000110', '10001110110', '11101110110', '11010001110',
      '11000101110', '11011101000', '11011100010', '11011101110', '11101011000',
      '11101000110', '11100010110', '11101101000', '11101100010', '11100011010',
      '11101111010', '11001000010', '11110001010', '10100110000', '10100001100',
      '10010110000', '10010000110', '10000101100', '10000100110', '10110010000',
      '10110000100', '10011010000', '10011000010', '10000110100', '10000110010',
      '11000010010', '11001010000', '11110111010', '11000010100', '10001111010',
      '10100111100', '10010111100', '10010011110', '10111100100', '10011110100',
      '10011110010', '11110100100', '11110010100', '11110010010', '11011011110',
      '11011110110', '11110110110', '10101111000', '10100011110', '10001011110',
      '10111101000', '10111100010', '11110101000', '11110100010', '10111011110',
      '10111101110', '11101011110', '11110101110', '11010000100', '11010010000',
      '11010011100', '1100011101011'
    ]
  }
};

function encodeCode128(data, isGS1 = false) {
  const { patterns, START_B, STOP, FNC1 } = ENCODINGS.CODE128;
  let values = [START_B];
  if (isGS1) values.push(FNC1);
  
  for (let i = 0; i < data.length; i++) {
    const charCode = data.charCodeAt(i);
    if (charCode >= 32 && charCode <= 126) {
      values.push(charCode - 32);
    }
  }
  
  // Calculate check digit
  let checksum = values[0];
  for (let i = 1; i < values.length; i++) {
    checksum += values[i] * i;
  }
  values.push(checksum % 103);
  values.push(STOP);
  
  return values.map(v => patterns[v]).join('');
}

function generateBarcodeSVG(encoding, width, height, showText = true, data = '') {
  const barWidth = 2;
  const quietZone = 10;
  const totalWidth = encoding.length * barWidth + quietZone * 2;
  
  let bars = '';
  let x = quietZone;
  for (let i = 0; i < encoding.length; i++) {
    if (encoding[i] === '1') {
      bars += `<rect x="${x}" y="0" width="${barWidth}" height="${height - (showText ? 20 : 0)}" fill="black"/>`;
    }
    x += barWidth;
  }
  
  const textElement = showText 
    ? `<text x="${totalWidth/2}" y="${height - 4}" text-anchor="middle" font-family="monospace" font-size="12">${data}</text>`
    : '';
  
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalWidth} ${height}" width="${width}" height="${height}">
    <rect width="100%" height="100%" fill="white"/>
    ${bars}
    ${textElement}
  </svg>`;
}

// EAN-13 Encoding
const EAN_L = ['0001101','0011001','0010011','0111101','0100011','0110001','0101111','0111011','0110111','0001011'];
const EAN_G = ['0100111','0110011','0011011','0100001','0011101','0111001','0000101','0010001','0001001','0010111'];
const EAN_R = ['1110010','1100110','1101100','1000010','1011100','1001110','1010000','1000100','1001000','1110100'];
const EAN_PARITY = ['LLLLLL','LLGLGG','LLGGLG','LLGGGL','LGLLGG','LGGLLG','LGGGLL','LGLGLG','LGLGGL','LGGLGL'];

function encodeEAN13(data) {
  const digits = data.replace(/\D/g, '').padStart(13, '0').slice(0, 13);
  const parity = EAN_PARITY[parseInt(digits[0])];
  
  let encoding = '101'; // Start
  for (let i = 1; i <= 6; i++) {
    const d = parseInt(digits[i]);
    encoding += parity[i-1] === 'L' ? EAN_L[d] : EAN_G[d];
  }
  encoding += '01010'; // Middle
  for (let i = 7; i <= 12; i++) {
    encoding += EAN_R[parseInt(digits[i])];
  }
  encoding += '101'; // End
  
  return encoding;
}

// UPC-A Encoding (subset of EAN-13)
function encodeUPCA(data) {
  const digits = data.replace(/\D/g, '').padStart(12, '0').slice(0, 12);
  return encodeEAN13('0' + digits);
}

// ========== Main Label Designer Component ==========
export default function LabelDesigner() {
  // Label dimensions (in dots at 203 DPI - standard 4x2 PTI label)
  const [labelWidth, setLabelWidth] = useState(812); // 4 inches
  const [labelHeight, setLabelHeight] = useState(406); // 2 inches
  const [dpi, setDpi] = useState(203);
  const [zoom, setZoom] = useState(1);
  const [showGrid, setShowGrid] = useState(true);
  const [gridSize, setGridSize] = useState(20);
  
  // Elements on the label
  const [elements, setElements] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  
  // API connection
  const [apiUrl, setApiUrl] = useState('http://localhost:3000');
  const [printers, setPrinters] = useState([]);
  const [selectedPrinter, setSelectedPrinter] = useState('');
  
  // PTI Data
  const [ptiData, setPtiData] = useState({
    companyPrefix: '0614141',
    itemReference: '12345',
    indicator: '1',
    lotNumber: 'ABC123',
    packDate: 'JAN15',
    commodity: 'ORGANIC STRAWBERRIES',
    packStyle: '8 x 1 LB CLAMSHELL',
    countryOfOrigin: 'PRODUCT OF USA',
    companyName: 'FRESH FARMS INC',
    companyAddress: '123 HARVEST LANE, FRESNO, CA 93650'
  });
  
  const canvasRef = useRef(null);
  const selectedElement = elements.find(el => el.id === selectedId);
  
  // Calculate derived values
  const gtin = formatGTIN14(ptiData.companyPrefix, ptiData.itemReference, ptiData.indicator);
  const voicePickCode = generateVoicePickCode(gtin, ptiData.lotNumber, ptiData.packDate);
  const gs1BarcodeData = `01${gtin}10${ptiData.lotNumber}`;
  
  // Load printers from API
  useEffect(() => {
    fetch(`${apiUrl}/api/printers`)
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          setPrinters(data.printers);
          if (data.printers.length > 0 && !selectedPrinter) {
            setSelectedPrinter(data.printers[0].id);
          }
        }
      })
      .catch(err => console.log('API not available:', err.message));
  }, [apiUrl]);
  
  // Add new element
  const addElement = (type) => {
    const id = `el_${Date.now()}`;
    let newElement = {
      id,
      type,
      x: 50,
      y: 50,
      locked: false,
      visible: true
    };
    
    switch (type) {
      case 'text':
        newElement = { ...newElement, text: 'Sample Text', fontSize: 24, fontFamily: 'Arial', bold: false, align: 'left', width: 200 };
        break;
      case 'barcode-gs1-128':
        newElement = { ...newElement, data: gs1BarcodeData, width: 400, height: 80, showText: true };
        break;
      case 'barcode-gs1-databar':
        newElement = { ...newElement, data: gtin, width: 200, height: 60, showText: true, subtype: 'omnidirectional' };
        break;
      case 'barcode-upc':
        newElement = { ...newElement, data: gtin.slice(1, 13), width: 200, height: 70, showText: true };
        break;
      case 'barcode-ean':
        newElement = { ...newElement, data: gtin.slice(1, 14), width: 200, height: 70, showText: true };
        break;
      case 'voicepick':
        newElement = { ...newElement, text: voicePickCode, fontSize: 36, fontFamily: 'Arial', bold: true, width: 100, height: 50 };
        break;
      case 'box':
        newElement = { ...newElement, width: 100, height: 50, borderWidth: 2 };
        break;
      case 'line':
        newElement = { ...newElement, width: 200, height: 2 };
        break;
      case 'gtin-text':
        newElement = { ...newElement, type: 'text', text: `(01) ${gtin}`, fontSize: 14, fontFamily: 'monospace', bold: false, width: 250 };
        break;
      case 'lot-text':
        newElement = { ...newElement, type: 'text', text: `LOT: ${ptiData.lotNumber}`, fontSize: 14, fontFamily: 'Arial', bold: false, width: 150 };
        break;
      case 'date-box':
        newElement = { ...newElement, type: 'datebox', text: ptiData.packDate, fontSize: 18, width: 80, height: 40 };
        break;
    }
    
    setElements([...elements, newElement]);
    setSelectedId(id);
  };
  
  // Delete element
  const deleteElement = (id) => {
    setElements(elements.filter(el => el.id !== id));
    if (selectedId === id) setSelectedId(null);
  };
  
  // Duplicate element
  const duplicateElement = (id) => {
    const el = elements.find(e => e.id === id);
    if (el) {
      const newEl = { ...el, id: `el_${Date.now()}`, x: el.x + 20, y: el.y + 20 };
      setElements([...elements, newEl]);
      setSelectedId(newEl.id);
    }
  };
  
  // Update element property
  const updateElement = (id, updates) => {
    setElements(elements.map(el => el.id === id ? { ...el, ...updates } : el));
  };
  
  // Mouse handlers for drag
  const handleMouseDown = (e, id) => {
    const el = elements.find(e => e.id === id);
    if (el?.locked) return;
    
    const rect = canvasRef.current.getBoundingClientRect();
    setSelectedId(id);
    setIsDragging(true);
    setDragOffset({
      x: (e.clientX - rect.left) / zoom - el.x,
      y: (e.clientY - rect.top) / zoom - el.y
    });
  };
  
  const handleMouseMove = (e) => {
    if (!isDragging || !selectedId) return;
    const el = elements.find(e => e.id === selectedId);
    if (el?.locked) return;
    
    const rect = canvasRef.current.getBoundingClientRect();
    let newX = (e.clientX - rect.left) / zoom - dragOffset.x;
    let newY = (e.clientY - rect.top) / zoom - dragOffset.y;
    
    // Snap to grid
    if (showGrid) {
      newX = Math.round(newX / gridSize) * gridSize;
      newY = Math.round(newY / gridSize) * gridSize;
    }
    
    updateElement(selectedId, { x: Math.max(0, newX), y: Math.max(0, newY) });
  };
  
  const handleMouseUp = () => {
    setIsDragging(false);
  };
  
  // Generate ZPL code
  const generateZPL = () => {
    let zpl = `^XA\n`;
    zpl += `^PW${labelWidth}\n`;
    zpl += `^LL${labelHeight}\n`;
    zpl += `^CI28\n`; // UTF-8
    
    elements.filter(el => el.visible).forEach(el => {
      const x = Math.round(el.x);
      const y = Math.round(el.y);
      
      switch (el.type) {
        case 'text':
          zpl += `^FO${x},${y}\n`;
          zpl += `^A0N,${el.fontSize},${el.fontSize}\n`;
          zpl += `^FD${el.text}^FS\n`;
          break;
          
        case 'barcode-gs1-128':
          zpl += `^FO${x},${y}\n`;
          zpl += `^BY2\n`;
          zpl += `^BCN,${el.height},${el.showText ? 'Y' : 'N'},N,N\n`;
          zpl += `^FD>:>8${el.data}^FS\n`;
          break;
          
        case 'barcode-gs1-databar':
          zpl += `^FO${x},${y}\n`;
          zpl += `^BRN,${el.subtype === 'expanded' ? '2' : '1'},3,1,${el.height},22\n`;
          zpl += `^FD${el.data}^FS\n`;
          break;
          
        case 'barcode-upc':
          zpl += `^FO${x},${y}\n`;
          zpl += `^BUN,${el.height},${el.showText ? 'Y' : 'N'},N,N\n`;
          zpl += `^FD${el.data}^FS\n`;
          break;
          
        case 'barcode-ean':
          zpl += `^FO${x},${y}\n`;
          zpl += `^BEN,${el.height},${el.showText ? 'Y' : 'N'},N\n`;
          zpl += `^FD${el.data}^FS\n`;
          break;
          
        case 'voicepick':
          zpl += `^FO${x},${y}\n`;
          zpl += `^GB${el.width + 20},${el.height + 10},2^FS\n`;
          zpl += `^FO${x + 10},${y + 5}\n`;
          zpl += `^A0N,${el.fontSize},${el.fontSize}\n`;
          zpl += `^FD${el.text}^FS\n`;
          break;
          
        case 'datebox':
          zpl += `^FO${x},${y}\n`;
          zpl += `^GB${el.width},${el.height},2^FS\n`;
          zpl += `^FO${x + 5},${y + 10}\n`;
          zpl += `^A0N,${el.fontSize},${el.fontSize}\n`;
          zpl += `^FD${el.text}^FS\n`;
          break;
          
        case 'box':
          zpl += `^FO${x},${y}\n`;
          zpl += `^GB${el.width},${el.height},${el.borderWidth}^FS\n`;
          break;
          
        case 'line':
          zpl += `^FO${x},${y}\n`;
          zpl += `^GB${el.width},${el.height},${el.height}^FS\n`;
          break;
      }
    });
    
    zpl += `^XZ`;
    return zpl;
  };
  
  // Print label
  const printLabel = async () => {
    if (!selectedPrinter) {
      alert('Please select a printer');
      return;
    }
    
    const zpl = generateZPL();
    
    try {
      const response = await fetch(`${apiUrl}/api/printers/${selectedPrinter}/print`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ zpl })
      });
      
      const data = await response.json();
      if (data.success) {
        alert('Label sent to printer!');
      } else {
        alert(`Print failed: ${data.error}`);
      }
    } catch (err) {
      alert(`Error: ${err.message}`);
    }
  };
  
  // Create PTI template
  const createPTITemplate = () => {
    const newElements = [
      // Company name at top
      { id: `el_${Date.now()}_1`, type: 'text', x: 20, y: 10, text: ptiData.companyName, fontSize: 20, fontFamily: 'Arial', bold: true, width: 400, locked: false, visible: true },
      // Address
      { id: `el_${Date.now()}_2`, type: 'text', x: 20, y: 35, text: ptiData.companyAddress, fontSize: 12, fontFamily: 'Arial', bold: false, width: 400, locked: false, visible: true },
      // Commodity
      { id: `el_${Date.now()}_3`, type: 'text', x: 20, y: 60, text: ptiData.commodity, fontSize: 28, fontFamily: 'Arial', bold: true, width: 500, locked: false, visible: true },
      // Pack style
      { id: `el_${Date.now()}_4`, type: 'text', x: 20, y: 95, text: ptiData.packStyle, fontSize: 16, fontFamily: 'Arial', bold: false, width: 300, locked: false, visible: true },
      // Country of origin
      { id: `el_${Date.now()}_5`, type: 'text', x: 20, y: 120, text: ptiData.countryOfOrigin, fontSize: 14, fontFamily: 'Arial', bold: true, width: 200, locked: false, visible: true },
      // GS1-128 Barcode
      { id: `el_${Date.now()}_6`, type: 'barcode-gs1-128', x: 20, y: 160, data: gs1BarcodeData, width: 500, height: 80, showText: true, locked: false, visible: true },
      // GTIN human readable
      { id: `el_${Date.now()}_7`, type: 'text', x: 20, y: 250, text: `(01) ${gtin}`, fontSize: 12, fontFamily: 'monospace', bold: false, width: 200, locked: false, visible: true },
      // Lot human readable
      { id: `el_${Date.now()}_8`, type: 'text', x: 250, y: 250, text: `(10) ${ptiData.lotNumber}`, fontSize: 12, fontFamily: 'monospace', bold: false, width: 150, locked: false, visible: true },
      // Pack date box
      { id: `el_${Date.now()}_9`, type: 'datebox', x: 550, y: 160, text: ptiData.packDate, fontSize: 20, width: 90, height: 45, locked: false, visible: true },
      // Voice pick code
      { id: `el_${Date.now()}_10`, type: 'voicepick', x: 660, y: 160, text: voicePickCode, fontSize: 32, fontFamily: 'Arial', bold: true, width: 100, height: 45, locked: false, visible: true },
    ];
    
    setElements(newElements);
    setSelectedId(null);
  };
  
  // Render element on canvas
  const renderElement = (el) => {
    if (!el.visible) return null;
    
    const isSelected = el.id === selectedId;
    const baseStyle = {
      position: 'absolute',
      left: el.x * zoom,
      top: el.y * zoom,
      cursor: el.locked ? 'not-allowed' : 'move',
      outline: isSelected ? '2px solid #3b82f6' : 'none',
      outlineOffset: '2px',
      opacity: el.locked ? 0.7 : 1
    };
    
    switch (el.type) {
      case 'text':
        return (
          <div
            key={el.id}
            style={{
              ...baseStyle,
              fontSize: el.fontSize * zoom,
              fontFamily: el.fontFamily,
              fontWeight: el.bold ? 'bold' : 'normal',
              textAlign: el.align || 'left',
              width: el.width ? el.width * zoom : 'auto',
              whiteSpace: 'nowrap'
            }}
            onMouseDown={(e) => handleMouseDown(e, el.id)}
          >
            {el.text}
          </div>
        );
        
      case 'barcode-gs1-128':
      case 'barcode-upc':
      case 'barcode-ean':
        const encoding = el.type === 'barcode-gs1-128' 
          ? encodeCode128(el.data, true)
          : el.type === 'barcode-upc' 
            ? encodeUPCA(el.data)
            : encodeEAN13(el.data);
        return (
          <div
            key={el.id}
            style={baseStyle}
            onMouseDown={(e) => handleMouseDown(e, el.id)}
            dangerouslySetInnerHTML={{ 
              __html: generateBarcodeSVG(encoding, el.width * zoom, el.height * zoom, el.showText, el.data) 
            }}
          />
        );
        
      case 'barcode-gs1-databar':
        // Simplified DataBar representation (actual rendering would need proper library)
        return (
          <div
            key={el.id}
            style={{
              ...baseStyle,
              width: el.width * zoom,
              height: el.height * zoom,
              border: '1px solid #000',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              background: '#fff',
              fontSize: 10 * zoom
            }}
            onMouseDown={(e) => handleMouseDown(e, el.id)}
          >
            <div style={{ fontFamily: 'monospace', marginBottom: 2 }}>GS1 DataBar</div>
            <div style={{ 
              width: '90%', 
              height: '60%', 
              background: 'repeating-linear-gradient(90deg, #000 0px, #000 2px, #fff 2px, #fff 4px)'
            }} />
            {el.showText && <div style={{ fontSize: 8 * zoom, marginTop: 2 }}>{el.data}</div>}
          </div>
        );
        
      case 'voicepick':
        return (
          <div
            key={el.id}
            style={{
              ...baseStyle,
              width: (el.width + 20) * zoom,
              height: (el.height + 10) * zoom,
              border: `2px solid #000`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontFamily: el.fontFamily || 'Arial',
              fontSize: el.fontSize * zoom,
              fontWeight: 'bold',
              background: '#fff'
            }}
            onMouseDown={(e) => handleMouseDown(e, el.id)}
          >
            {el.text}
          </div>
        );
        
      case 'datebox':
        return (
          <div
            key={el.id}
            style={{
              ...baseStyle,
              width: el.width * zoom,
              height: el.height * zoom,
              border: '2px solid #000',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: el.fontSize * zoom,
              fontWeight: 'bold',
              background: '#fff'
            }}
            onMouseDown={(e) => handleMouseDown(e, el.id)}
          >
            {el.text}
          </div>
        );
        
      case 'box':
        return (
          <div
            key={el.id}
            style={{
              ...baseStyle,
              width: el.width * zoom,
              height: el.height * zoom,
              border: `${el.borderWidth}px solid #000`,
              background: 'transparent'
            }}
            onMouseDown={(e) => handleMouseDown(e, el.id)}
          />
        );
        
      case 'line':
        return (
          <div
            key={el.id}
            style={{
              ...baseStyle,
              width: el.width * zoom,
              height: el.height * zoom,
              background: '#000'
            }}
            onMouseDown={(e) => handleMouseDown(e, el.id)}
          />
        );
        
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col" style={{ fontFamily: "'JetBrains Mono', 'Fira Code', monospace" }}>
      {/* Header */}
      <header className="bg-slate-800 border-b border-slate-700 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-gradient-to-br from-emerald-400 to-cyan-500 rounded-lg flex items-center justify-center">
              <BarChart3 size={18} className="text-slate-900" />
            </div>
            <h1 className="text-xl font-bold bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent">
              PTI Label Designer
            </h1>
          </div>
          <span className="text-xs text-slate-500 px-2 py-1 bg-slate-700 rounded">GTIN/PTI/Voice Pick</span>
        </div>
        
        <div className="flex items-center gap-3">
          <select 
            value={selectedPrinter}
            onChange={(e) => setSelectedPrinter(e.target.value)}
            className="bg-slate-700 border border-slate-600 rounded px-3 py-1.5 text-sm focus:outline-none focus:border-emerald-500"
          >
            <option value="">Select Printer...</option>
            {printers.map(p => (
              <option key={p.id} value={p.id}>{p.name} ({p.status})</option>
            ))}
          </select>
          
          <button 
            onClick={printLabel}
            className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 px-4 py-1.5 rounded font-medium text-sm transition-colors"
          >
            <Printer size={16} />
            Print
          </button>
        </div>
      </header>
      
      <div className="flex flex-1 overflow-hidden">
        {/* Left Sidebar - Toolbox */}
        <aside className="w-64 bg-slate-800 border-r border-slate-700 p-4 overflow-y-auto">
          <div className="space-y-6">
            {/* Quick Actions */}
            <div>
              <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Quick Start</h3>
              <button
                onClick={createPTITemplate}
                className="w-full flex items-center gap-2 bg-gradient-to-r from-emerald-600 to-cyan-600 hover:from-emerald-500 hover:to-cyan-500 px-3 py-2 rounded text-sm font-medium transition-all"
              >
                <Layers size={16} />
                Create PTI Template
              </button>
            </div>
            
            {/* Add Elements */}
            <div>
              <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Add Elements</h3>
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => addElement('text')} className="flex flex-col items-center gap-1 p-3 bg-slate-700 hover:bg-slate-600 rounded transition-colors">
                  <Type size={20} />
                  <span className="text-xs">Text</span>
                </button>
                <button onClick={() => addElement('box')} className="flex flex-col items-center gap-1 p-3 bg-slate-700 hover:bg-slate-600 rounded transition-colors">
                  <Grid3X3 size={20} />
                  <span className="text-xs">Box</span>
                </button>
                <button onClick={() => addElement('line')} className="flex flex-col items-center gap-1 p-3 bg-slate-700 hover:bg-slate-600 rounded transition-colors">
                  <div className="w-5 h-0.5 bg-current" />
                  <span className="text-xs">Line</span>
                </button>
                <button onClick={() => addElement('voicepick')} className="flex flex-col items-center gap-1 p-3 bg-slate-700 hover:bg-slate-600 rounded transition-colors">
                  <span className="text-sm font-bold">VP</span>
                  <span className="text-xs">Voice Pick</span>
                </button>
              </div>
            </div>
            
            {/* Barcodes */}
            <div>
              <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Barcodes</h3>
              <div className="space-y-2">
                <button onClick={() => addElement('barcode-gs1-128')} className="w-full flex items-center gap-2 p-2 bg-slate-700 hover:bg-slate-600 rounded transition-colors text-left">
                  <BarChart3 size={16} />
                  <span className="text-sm">GS1-128</span>
                </button>
                <button onClick={() => addElement('barcode-gs1-databar')} className="w-full flex items-center gap-2 p-2 bg-slate-700 hover:bg-slate-600 rounded transition-colors text-left">
                  <BarChart3 size={16} />
                  <span className="text-sm">GS1 DataBar</span>
                </button>
                <button onClick={() => addElement('barcode-upc')} className="w-full flex items-center gap-2 p-2 bg-slate-700 hover:bg-slate-600 rounded transition-colors text-left">
                  <BarChart3 size={16} />
                  <span className="text-sm">UPC-A</span>
                </button>
                <button onClick={() => addElement('barcode-ean')} className="w-full flex items-center gap-2 p-2 bg-slate-700 hover:bg-slate-600 rounded transition-colors text-left">
                  <BarChart3 size={16} />
                  <span className="text-sm">EAN-13</span>
                </button>
              </div>
            </div>
            
            {/* PTI Data Fields */}
            <div>
              <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">PTI Data</h3>
              <div className="space-y-2 text-sm">
                <div>
                  <label className="text-xs text-slate-500">Company Prefix</label>
                  <input
                    type="text"
                    value={ptiData.companyPrefix}
                    onChange={(e) => setPtiData({...ptiData, companyPrefix: e.target.value})}
                    className="w-full bg-slate-700 border border-slate-600 rounded px-2 py-1 text-sm focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-500">Item Reference</label>
                  <input
                    type="text"
                    value={ptiData.itemReference}
                    onChange={(e) => setPtiData({...ptiData, itemReference: e.target.value})}
                    className="w-full bg-slate-700 border border-slate-600 rounded px-2 py-1 text-sm focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-500">Lot Number</label>
                  <input
                    type="text"
                    value={ptiData.lotNumber}
                    onChange={(e) => setPtiData({...ptiData, lotNumber: e.target.value})}
                    className="w-full bg-slate-700 border border-slate-600 rounded px-2 py-1 text-sm focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-500">Pack Date</label>
                  <input
                    type="text"
                    value={ptiData.packDate}
                    onChange={(e) => setPtiData({...ptiData, packDate: e.target.value})}
                    className="w-full bg-slate-700 border border-slate-600 rounded px-2 py-1 text-sm focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-500">Commodity</label>
                  <input
                    type="text"
                    value={ptiData.commodity}
                    onChange={(e) => setPtiData({...ptiData, commodity: e.target.value})}
                    className="w-full bg-slate-700 border border-slate-600 rounded px-2 py-1 text-sm focus:outline-none focus:border-emerald-500"
                  />
                </div>
                
                <div className="pt-2 border-t border-slate-700">
                  <div className="text-xs text-slate-500">Generated GTIN-14</div>
                  <div className="font-mono text-emerald-400">{gtin}</div>
                </div>
                <div>
                  <div className="text-xs text-slate-500">Voice Pick Code</div>
                  <div className="font-mono text-cyan-400 text-lg">{voicePickCode}</div>
                </div>
              </div>
            </div>
          </div>
        </aside>
        
        {/* Main Canvas Area */}
        <main className="flex-1 flex flex-col overflow-hidden">
          {/* Toolbar */}
          <div className="bg-slate-800 border-b border-slate-700 px-4 py-2 flex items-center gap-4">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setZoom(Math.max(0.25, zoom - 0.25))}
                className="p-1.5 hover:bg-slate-700 rounded"
              >
                <ZoomOut size={16} />
              </button>
              <span className="text-sm w-16 text-center">{Math.round(zoom * 100)}%</span>
              <button
                onClick={() => setZoom(Math.min(2, zoom + 0.25))}
                className="p-1.5 hover:bg-slate-700 rounded"
              >
                <ZoomIn size={16} />
              </button>
            </div>
            
            <div className="h-6 w-px bg-slate-600" />
            
            <button
              onClick={() => setShowGrid(!showGrid)}
              className={`p-1.5 rounded ${showGrid ? 'bg-slate-600' : 'hover:bg-slate-700'}`}
            >
              <Grid3X3 size={16} />
            </button>
            
            <div className="h-6 w-px bg-slate-600" />
            
            <div className="flex items-center gap-2 text-sm">
              <span className="text-slate-400">Label:</span>
              <input
                type="number"
                value={Math.round(labelWidth / dpi * 1000) / 1000}
                onChange={(e) => setLabelWidth(Math.round(parseFloat(e.target.value) * dpi))}
                className="w-16 bg-slate-700 border border-slate-600 rounded px-2 py-0.5 text-center"
              />
              <span className="text-slate-500">×</span>
              <input
                type="number"
                value={Math.round(labelHeight / dpi * 1000) / 1000}
                onChange={(e) => setLabelHeight(Math.round(parseFloat(e.target.value) * dpi))}
                className="w-16 bg-slate-700 border border-slate-600 rounded px-2 py-0.5 text-center"
              />
              <span className="text-slate-400">in</span>
            </div>
            
            <div className="flex-1" />
            
            <button
              onClick={() => {
                const zpl = generateZPL();
                navigator.clipboard.writeText(zpl);
                alert('ZPL copied to clipboard!');
              }}
              className="flex items-center gap-1 px-3 py-1 bg-slate-700 hover:bg-slate-600 rounded text-sm"
            >
              <Copy size={14} />
              Copy ZPL
            </button>
          </div>
          
          {/* Canvas */}
          <div 
            className="flex-1 overflow-auto p-8 flex items-start justify-center"
            style={{ background: 'repeating-conic-gradient(#1e293b 0 90deg, #0f172a 0 180deg) 0 0/20px 20px' }}
          >
            <div
              ref={canvasRef}
              className="relative bg-white shadow-2xl"
              style={{
                width: labelWidth * zoom,
                height: labelHeight * zoom,
                backgroundImage: showGrid 
                  ? `linear-gradient(#ddd 1px, transparent 1px), linear-gradient(90deg, #ddd 1px, transparent 1px)`
                  : 'none',
                backgroundSize: `${gridSize * zoom}px ${gridSize * zoom}px`
              }}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
              onClick={(e) => {
                if (e.target === canvasRef.current) setSelectedId(null);
              }}
            >
              {elements.map(renderElement)}
            </div>
          </div>
        </main>
        
        {/* Right Sidebar - Properties */}
        <aside className="w-72 bg-slate-800 border-l border-slate-700 p-4 overflow-y-auto">
          {selectedElement ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-300">Properties</h3>
                <div className="flex gap-1">
                  <button
                    onClick={() => updateElement(selectedId, { locked: !selectedElement.locked })}
                    className="p-1.5 hover:bg-slate-700 rounded"
                    title={selectedElement.locked ? 'Unlock' : 'Lock'}
                  >
                    {selectedElement.locked ? <Lock size={14} /> : <Unlock size={14} />}
                  </button>
                  <button
                    onClick={() => updateElement(selectedId, { visible: !selectedElement.visible })}
                    className="p-1.5 hover:bg-slate-700 rounded"
                    title={selectedElement.visible ? 'Hide' : 'Show'}
                  >
                    {selectedElement.visible ? <Eye size={14} /> : <EyeOff size={14} />}
                  </button>
                  <button
                    onClick={() => duplicateElement(selectedId)}
                    className="p-1.5 hover:bg-slate-700 rounded"
                    title="Duplicate"
                  >
                    <Copy size={14} />
                  </button>
                  <button
                    onClick={() => deleteElement(selectedId)}
                    className="p-1.5 hover:bg-slate-700 rounded text-red-400"
                    title="Delete"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
              
              <div className="space-y-3 text-sm">
                {/* Position */}
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs text-slate-500">X</label>
                    <input
                      type="number"
                      value={Math.round(selectedElement.x)}
                      onChange={(e) => updateElement(selectedId, { x: parseInt(e.target.value) || 0 })}
                      className="w-full bg-slate-700 border border-slate-600 rounded px-2 py-1 focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-slate-500">Y</label>
                    <input
                      type="number"
                      value={Math.round(selectedElement.y)}
                      onChange={(e) => updateElement(selectedId, { y: parseInt(e.target.value) || 0 })}
                      className="w-full bg-slate-700 border border-slate-600 rounded px-2 py-1 focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                </div>
                
                {/* Size (for applicable elements) */}
                {selectedElement.width !== undefined && (
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-xs text-slate-500">Width</label>
                      <input
                        type="number"
                        value={selectedElement.width}
                        onChange={(e) => updateElement(selectedId, { width: parseInt(e.target.value) || 100 })}
                        className="w-full bg-slate-700 border border-slate-600 rounded px-2 py-1 focus:outline-none focus:border-emerald-500"
                      />
                    </div>
                    {selectedElement.height !== undefined && (
                      <div>
                        <label className="text-xs text-slate-500">Height</label>
                        <input
                          type="number"
                          value={selectedElement.height}
                          onChange={(e) => updateElement(selectedId, { height: parseInt(e.target.value) || 50 })}
                          className="w-full bg-slate-700 border border-slate-600 rounded px-2 py-1 focus:outline-none focus:border-emerald-500"
                        />
                      </div>
                    )}
                  </div>
                )}
                
                {/* Text properties */}
                {selectedElement.text !== undefined && (
                  <>
                    <div>
                      <label className="text-xs text-slate-500">Text</label>
                      <input
                        type="text"
                        value={selectedElement.text}
                        onChange={(e) => updateElement(selectedId, { text: e.target.value })}
                        className="w-full bg-slate-700 border border-slate-600 rounded px-2 py-1 focus:outline-none focus:border-emerald-500"
                      />
                    </div>
                    {selectedElement.fontSize !== undefined && (
                      <div>
                        <label className="text-xs text-slate-500">Font Size</label>
                        <input
                          type="number"
                          value={selectedElement.fontSize}
                          onChange={(e) => updateElement(selectedId, { fontSize: parseInt(e.target.value) || 12 })}
                          className="w-full bg-slate-700 border border-slate-600 rounded px-2 py-1 focus:outline-none focus:border-emerald-500"
                        />
                      </div>
                    )}
                  </>
                )}
                
                {/* Barcode properties */}
                {selectedElement.data !== undefined && (
                  <>
                    <div>
                      <label className="text-xs text-slate-500">Barcode Data</label>
                      <input
                        type="text"
                        value={selectedElement.data}
                        onChange={(e) => updateElement(selectedId, { data: e.target.value })}
                        className="w-full bg-slate-700 border border-slate-600 rounded px-2 py-1 font-mono focus:outline-none focus:border-emerald-500"
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id="showText"
                        checked={selectedElement.showText}
                        onChange={(e) => updateElement(selectedId, { showText: e.target.checked })}
                        className="rounded border-slate-600"
                      />
                      <label htmlFor="showText" className="text-xs text-slate-400">Show human readable</label>
                    </div>
                  </>
                )}
                
                {/* DataBar subtype */}
                {selectedElement.type === 'barcode-gs1-databar' && (
                  <div>
                    <label className="text-xs text-slate-500">DataBar Type</label>
                    <select
                      value={selectedElement.subtype || 'omnidirectional'}
                      onChange={(e) => updateElement(selectedId, { subtype: e.target.value })}
                      className="w-full bg-slate-700 border border-slate-600 rounded px-2 py-1 focus:outline-none focus:border-emerald-500"
                    >
                      <option value="omnidirectional">Omnidirectional</option>
                      <option value="truncated">Truncated</option>
                      <option value="stacked">Stacked</option>
                      <option value="expanded">Expanded</option>
                      <option value="limited">Limited</option>
                    </select>
                  </div>
                )}
                
                {/* Border width for boxes */}
                {selectedElement.borderWidth !== undefined && (
                  <div>
                    <label className="text-xs text-slate-500">Border Width</label>
                    <input
                      type="number"
                      value={selectedElement.borderWidth}
                      onChange={(e) => updateElement(selectedId, { borderWidth: parseInt(e.target.value) || 1 })}
                      className="w-full bg-slate-700 border border-slate-600 rounded px-2 py-1 focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="text-center text-slate-500 py-8">
              <Move size={32} className="mx-auto mb-2 opacity-50" />
              <p className="text-sm">Select an element to edit its properties</p>
            </div>
          )}
          
          {/* Elements List */}
          <div className="mt-6 pt-4 border-t border-slate-700">
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Layers</h3>
            <div className="space-y-1">
              {elements.map((el, idx) => (
                <div
                  key={el.id}
                  onClick={() => setSelectedId(el.id)}
                  className={`flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer text-sm ${
                    el.id === selectedId ? 'bg-slate-600' : 'hover:bg-slate-700'
                  }`}
                >
                  {el.type.includes('barcode') ? <BarChart3 size={14} /> : <Type size={14} />}
                  <span className="flex-1 truncate">
                    {el.text || el.data || el.type}
                  </span>
                  {el.locked && <Lock size={12} className="text-slate-500" />}
                  {!el.visible && <EyeOff size={12} className="text-slate-500" />}
                </div>
              ))}
            </div>
          </div>
          
          {/* ZPL Preview */}
          <div className="mt-6 pt-4 border-t border-slate-700">
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">ZPL Preview</h3>
            <pre className="text-xs bg-slate-900 p-3 rounded overflow-auto max-h-48 text-emerald-400 font-mono">
              {generateZPL()}
            </pre>
          </div>
        </aside>
      </div>
    </div>
  );
}
