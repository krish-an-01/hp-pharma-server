const express = require('express');
const cors = require('cors');
const PDFDocument = require('pdfkit');
const fs = require('fs');

const app = express();
app.use(express.json());
app.use(cors());

// Make the invoices folder publicly accessible for downloads
app.use('/invoices', express.static('invoices'));

// Mock Database: Inventory at Nadaun Hub
let inventory = [
  { id: '1', name: 'Paracetamol 650mg (10x10 Box)', price: 450, stock: 120 },
  { id: '2', name: 'Pantoprazole 40mg (10x10 Box)', price: 620, stock: 85 },
  { id: '3', name: 'Amoxy-Clav 625mg (1x10 Strip)', price: 1100, stock: 50 },
  { id: '4', name: 'Aceclofenac + Paracetamol (10x10)', price: 520, stock: 150 },
  { id: '5', name: 'Telmisartan 40mg (10x10 Box)', price: 380, stock: 90 },
  { id: '6', name: 'Azithromycin 500mg (5x3 Tablets)', price: 350, stock: 60 },
  { id: '7', name: 'Cetirizine 10mg (10x10 Box)', price: 180, stock: 200 }
];

// Endpoint to fetch live catalog for the mobile app
app.get('/api/catalog', (req, res) => {
  res.json({ success: true, products: inventory });
});

// Endpoint to process order and generate GST invoice
app.post('/api/orders', (req, res) => {
  const { chemistPhone, licenseNumber, items } = req.body;

  if (!chemistPhone || !licenseNumber || !items || Object.keys(items).length === 0) {
    return res.status(400).json({ success: false, message: 'Invalid order payload.' });
  }

  let subtotal = 0;
  let orderedItemsDetail = [];

  // 1. Verify stock and calculate totals
  for (const [id, qty] of Object.entries(items)) {
    const product = inventory.find(p => p.id === id);
    if (!product || product.stock < qty) {
      return res.status(400).json({ 
        success: false, 
        message: `Stock unavailable for product ID: ${id}` 
      });
    }
    
    // Deduct stock from inventory
    product.stock -= qty;

    const itemTotal = product.price * qty;
    subtotal += itemTotal;
    orderedItemsDetail.push({
      name: product.name,
      qty,
      price: product.price,
      total: itemTotal
    });
  }

  // Intra-state GST calculation for Himachal Pradesh (CGST 6% + SGST 6% = 12%)
  const cgst = subtotal * 0.06;
  const sgst = subtotal * 0.06;
  const grandTotal = subtotal + cgst + sgst;
  const orderId = 'HP-' + Math.floor(100000 + Math.random() * 900000);

  // 2. Generate PDF GST Tax Invoice
  const doc = new PDFDocument({ margin: 50 });
  const invoiceFileName = `invoice_${orderId}.pdf`;
  const invoicePath = `./invoices/${invoiceFileName}`;
  
  if (!fs.existsSync('./invoices')) {
    fs.mkdirSync('./invoices');
  }
  
  const writeStream = fs.createWriteStream(invoicePath);
  doc.pipe(writeStream);

  // PDF Header
  doc.fontSize(20).text('H.P. PHARMA B2B DISTRIBUTORS', { align: 'center' });
  doc.fontSize(10).text('Nadaun Hub, District Hamirpur, H.P. | Wholesaler Drug License: Form 20B/21B', { align: 'center' });
  doc.text('GSTIN: 02AAAAA0000A1Z5', { align: 'center' });
  doc.moveDown();

  // Invoice Meta
  doc.fontSize(12).text(`Tax Invoice ID: ${orderId}`);
  doc.text(`Date: ${new Date().toLocaleDateString()}`);
  doc.text(`Chemist Phone: ${chemistPhone}`);
  doc.text(`Retail License No: ${licenseNumber}`);
  doc.moveDown();

  // Table Headers
  doc.fontSize(10).text('Item Description', 50, doc.y, { continued: true });
  doc.text('Qty', 300, doc.y, { continued: true });
  doc.text('Rate', 360, doc.y, { continued: true });
  doc.text('Total', 440, doc.y);
  doc.text('---------------------------------------------------------------------------------------------------------');

  // Table Rows
  orderedItemsDetail.forEach(item => {
    doc.text(item.name, 50, doc.y, { continued: true, width: 240 });
    doc.text(item.qty.toString(), 300, doc.y, { continued: true });
    doc.text(`₹${item.price}`, 360, doc.y, { continued: true });
    doc.text(`₹${item.total}`, 440, doc.y);
  });

  doc.text('---------------------------------------------------------------------------------------------------------');
  doc.moveDown();

  // Totals
  doc.text(`Subtotal: ₹${subtotal.toFixed(2)}`, { align: 'right' });
  doc.text(`CGST (6%): ₹${cgst.toFixed(2)}`, { align: 'right' });
  doc.text(`SGST (6%): ₹${sgst.toFixed(2)}`, { align: 'right' });
  doc.fontSize(12).text(`Grand Total: ₹${grandTotal.toFixed(2)}`, { align: 'right', bold: true });
  
  doc.end();

  // 3. WAIT FOR THE PDF TO FINISH WRITING, THEN SEND THE RESPONSE
  writeStream.on('finish', () => {
    res.json({
      success: true,
      message: 'Order placed successfully, inventory updated, and tax invoice generated.',
      orderId,
      grandTotal,
      invoiceUrl: `/invoices/${invoiceFileName}`
    });
  });

// Start Server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Nadaun B2B Pharma Server running on port ${PORT}`);
});