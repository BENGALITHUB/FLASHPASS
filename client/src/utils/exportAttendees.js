import { jsPDF } from 'jspdf';

const safeSlug = (s = 'attendees') => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'attendees';
const fmtDate = (d) => {
  if (!d) return '';
  const dt = new Date(d);
  return Number.isNaN(dt.getTime()) ? '' : dt.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
};
const triggerDownload = (blob, filename) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

// Formula-injection guard for spreadsheets
const safeCell = (val) => {
  const s = String(val ?? '');
  return /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
};

/**
 * 1. Download Attendees as UTF-8 CSV
 */
export function exportAttendeesCSV(rows, eventLabel = 'FlashPass') {
  const headers = ['#', 'Order ID', 'Event', 'Full Name', 'Mobile', 'Email', 'Ticket Tier', 'Channel', 'Amount (INR)', 'Status', 'Presence', 'Booked At'];
  const csvEscape = (v) => `"${safeCell(v).replace(/"/g, '""')}"`;
  const lines = [headers.map(csvEscape).join(',')];

  rows.forEach((r, i) => {
    lines.push([
      i + 1,
      r.orderId,
      r.eventName || r.eventId,
      r.holderName,
      r.phone,
      r.email || '',
      r.tierName || 'General',
      r.channel || 'ONLINE',
      ((r.amountPaise || 0) / 100).toFixed(2),
      r.status,
      r.presence,
      fmtDate(r.bookedAt)
    ].map(csvEscape).join(','));
  });

  // UTF-8 BOM ensures Excel reads Indian Rupee & Unicode cleanly
  const blob = new Blob(['\uFEFF' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
  triggerDownload(blob, `${safeSlug(eventLabel)}_attendees_${new Date().toISOString().slice(0, 10)}.csv`);
}

/**
 * 2. Download Attendees as Microsoft Excel (.xls SpreadsheetML XML)
 */
export function exportAttendeesExcel(rows, eventLabel = 'FlashPass') {
  const xmlEsc = (v) => safeCell(v)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

  const headers = ['#', 'Order ID', 'Event', 'Full Name', 'Mobile', 'Email', 'Ticket Tier', 'Channel', 'Amount (INR)', 'Status', 'Presence', 'Booked At'];
  const headerXml = headers.map(h => `<Cell ss:StyleID="hdr"><Data ss:Type="String">${xmlEsc(h)}</Data></Cell>`).join('');

  const rowsXml = rows.map((r, i) => {
    const cells = [
      { type: 'Number', val: i + 1 },
      { type: 'String', val: r.orderId },
      { type: 'String', val: r.eventName || r.eventId },
      { type: 'String', val: r.holderName },
      { type: 'String', val: r.phone },
      { type: 'String', val: r.email || '' },
      { type: 'String', val: r.tierName || 'General' },
      { type: 'String', val: r.channel || 'ONLINE' },
      { type: 'Number', val: ((r.amountPaise || 0) / 100).toFixed(2) },
      { type: 'String', val: r.status },
      { type: 'String', val: r.presence },
      { type: 'String', val: fmtDate(r.bookedAt) }
    ];
    return `<Row>${cells.map(c => `<Cell><Data ss:Type="${c.type}">${xmlEsc(c.val)}</Data></Cell>`).join('')}</Row>`;
  }).join('\n');

  const workbook = `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
 <Styles>
  <Style ss:ID="hdr">
   <Font ss:Bold="1" ss:Color="#FFFFFF"/>
   <Interior ss:Color="#13132A" ss:Pattern="Solid"/>
  </Style>
 </Styles>
 <Worksheet ss:Name="Attendees">
  <Table>
   <Row>${headerXml}</Row>
   ${rowsXml}
  </Table>
 </Worksheet>
</Workbook>`;

  const blob = new Blob([workbook], { type: 'application/vnd.ms-excel;charset=utf-8;' });
  triggerDownload(blob, `${safeSlug(eventLabel)}_attendees_${new Date().toISOString().slice(0, 10)}.xls`);
}

/**
 * 3. Download Attendees as Landscape A4 PDF
 */
export function exportAttendeesPDF(rows, eventLabel = 'FlashPass') {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 10;

  const drawHeader = (pageNum) => {
    doc.setFillColor(19, 19, 42);
    doc.rect(0, 0, pageW, 20, 'F');
    doc.setTextColor(255, 214, 10);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.text(`FLASHPASS — ATTENDEES & TICKET BUYERS REPORT`, margin, 9);
    doc.setTextColor(220, 220, 235);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.text(`Event: ${eventLabel}   |   Total Records: ${rows.length}   |   Generated: ${new Date().toLocaleString('en-IN')}`, margin, 15.5);
    doc.text(`Page ${pageNum}`, pageW - margin - 14, 15.5);
  };

  const cols = [
    { label: '#', w: 9 },
    { label: 'Order ID', w: 30 },
    { label: 'Full Name', w: 46 },
    { label: 'Mobile', w: 26 },
    { label: 'Email Address', w: 62 },
    { label: 'Tier', w: 30 },
    { label: 'Channel', w: 24 },
    { label: 'Amt (INR)', w: 20 },
    { label: 'Status', w: 18 },
    { label: 'Entry', w: 16 }
  ];

  const drawTableHead = (y) => {
    doc.setFillColor(38, 38, 72);
    doc.rect(margin, y, pageW - margin * 2, 7.5, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    let x = margin + 1.5;
    cols.forEach(c => {
      doc.text(c.label, x, y + 5);
      x += c.w;
    });
    return y + 7.5;
  };

  let pageNum = 1;
  drawHeader(pageNum);
  let y = drawTableHead(24);

  const fit = (txt, maxChars) => {
    const s = String(txt ?? '');
    return s.length > maxChars ? `${s.slice(0, maxChars - 1)}…` : s;
  };

  rows.forEach((r, idx) => {
    if (y > pageH - 12) {
      doc.addPage();
      pageNum += 1;
      drawHeader(pageNum);
      y = drawTableHead(24);
    }
    if (idx % 2 === 1) {
      doc.setFillColor(246, 247, 251);
      doc.rect(margin, y, pageW - margin * 2, 6.5, 'F');
    }
    doc.setTextColor(25, 25, 35);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);

    const vals = [
      String(idx + 1),
      fit(r.orderId, 16),
      fit(r.holderName, 24),
      fit(r.phone, 12),
      fit(r.email || '—', 34),
      fit(r.tierName || 'General', 16),
      fit(r.channel || 'ONLINE', 12),
      ((r.amountPaise || 0) / 100).toFixed(0),
      fit(r.status, 8),
      fit(r.presence, 8)
    ];

    let x = margin + 1.5;
    vals.forEach((v, ci) => {
      doc.text(v, x, y + 4.5);
      x += cols[ci].w;
    });
    y += 6.5;
  });

  doc.save(`${safeSlug(eventLabel)}_attendees_${new Date().toISOString().slice(0, 10)}.pdf`);
}
