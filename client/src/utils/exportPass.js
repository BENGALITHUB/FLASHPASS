import { toPng, toBlob } from 'html-to-image';
import jsPDF from 'jspdf';
import QRCode from 'qrcode';

/**
 * Save Pass Card as High-Res PNG (1080x1920 ratio) with attendee's name
 */
export const savePassImage = async (cardElementId, orderId, holderName = 'Attendee') => {
  const node = document.getElementById(cardElementId);
  if (!node) throw new Error('Pass element not found');

  const dataUrl = await toPng(node, {
    quality: 0.95,
    pixelRatio: 2,
    backgroundColor: '#0B0B14'
  });

  const safeName = holderName.trim().replace(/[^a-zA-Z0-9_-]/g, '_') || 'Attendee';
  const link = document.createElement('a');
  link.download = `FlashPass_${safeName}_${orderId}.png`;
  link.href = dataUrl;
  link.click();
};

/**
 * Download Printable A6 PDF Pass with attendee's name and individual QR
 */
export const downloadPassPDF = async (pass, qrDataUrl) => {
  const { doc, fileName } = buildPassPDF(pass, qrDataUrl);
  doc.save(fileName);
};

const buildPassPDF = (pass, qrDataUrl) => {
  // A6 format: 105 x 148 mm
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a6'
  });

  // Dark background
  doc.setFillColor(11, 11, 20); // #0B0B14
  doc.rect(0, 0, 105, 148, 'F');

  // Comic border
  doc.setDrawColor(255, 214, 10); // Yellow
  doc.setLineWidth(1.5);
  doc.rect(4, 4, 97, 140);

  // Title
  doc.setTextColor(255, 214, 10);
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text('3-DAY COMICS CARNIVAL', 52.5, 15, { align: 'center' });

  doc.setFontSize(9);
  doc.setTextColor(245, 245, 250);
  doc.text('12-14 DEC 2026 • KOLKATA', 52.5, 20, { align: 'center' });

  // Badge box
  doc.setFillColor(255, 46, 136); // Magenta #FF2E88
  doc.roundedRect(15, 24, 75, 8, 2, 2, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text(pass.badge || '3-DAY ALL ACCESS', 52.5, 29.5, { align: 'center' });

  // QR Code on pure white background
  if (qrDataUrl) {
    if (pass.photoUrl) {
      // Compact layout to fit Photo Badge + QR
      doc.setFillColor(255, 255, 255);
      doc.roundedRect(29.5, 34, 46, 46, 2.5, 2.5, 'F');
      doc.addImage(qrDataUrl, 'PNG', 32, 36.5, 41, 41);

      // Embedded Photo Badge
      try {
        doc.setFillColor(255, 214, 10);
        doc.roundedRect(42.5, 83, 20, 20, 2, 2, 'F');
        doc.addImage(pass.photoUrl, 'JPEG', 43, 83.5, 19, 19);
      } catch (e) {}

      // Attendee Info
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(13);
      doc.setFont('helvetica', 'bold');
      doc.text(pass.holderName.toUpperCase(), 52.5, 108, { align: 'center' });

      doc.setFontSize(9);
      doc.setTextColor(163, 163, 194);
      doc.setFont('helvetica', 'normal');
      doc.text(pass.maskedPhone || pass.phone, 52.5, 113, { align: 'center' });
    } else {
      doc.setFillColor(255, 255, 255);
      doc.roundedRect(24, 36, 57, 57, 3, 3, 'F');
      doc.addImage(qrDataUrl, 'PNG', 27.5, 39.5, 50, 50);

      // Attendee Info
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.text(pass.holderName.toUpperCase(), 52.5, 102, { align: 'center' });

      doc.setFontSize(10);
      doc.setTextColor(163, 163, 194);
      doc.setFont('helvetica', 'normal');
      doc.text(pass.maskedPhone || pass.phone, 52.5, 108, { align: 'center' });
    }
  }

  // Valid Days
  const daysText = pass.validDays ? pass.validDays.map(d => `[DAY ${d}]`).join('  ') : '[ALL DAYS]';
  doc.setFontSize(11);
  doc.setTextColor(34, 211, 238); // Cyan
  doc.setFont('helvetica', 'bold');
  doc.text(daysText, 52.5, 116, { align: 'center' });

  // Order ID / Pass ID
  doc.setFillColor(32, 32, 58);
  doc.roundedRect(15, 122, 75, 8, 2, 2, 'F');
  doc.setTextColor(255, 214, 10);
  doc.setFontSize(10);
  doc.text(`Pass ID: ${pass.orderId}`, 52.5, 127.5, { align: 'center' });

  // Footer instruction
  doc.setFontSize(7);
  doc.setTextColor(163, 163, 194);
  doc.setFont('helvetica', 'italic');
  doc.text('Show this QR at the gate • High brightness required', 52.5, 137, { align: 'center' });

  // Safe file naming with attendee's name
  const safeName = (pass.holderName || 'Attendee').trim().replace(/[^a-zA-Z0-9_-]/g, '_');
  return { doc, fileName: `FlashPass_${safeName}_${pass.orderId}.pdf` };
};

/**
 * Bulk download all passes in a group booking as individual PDFs
 */
export const downloadAllPassesPDF = async (passes, onProgress = null) => {
  if (!Array.isArray(passes) || passes.length === 0) return;

  for (let i = 0; i < passes.length; i++) {
    const p = passes[i];
    if (onProgress) {
      onProgress(i + 1, passes.length, p.holderName);
    }

    let qrUrl = '';
    if (p.qrToken) {
      try {
        qrUrl = await QRCode.toDataURL(p.qrToken, {
          width: 320,
          margin: 2,
          color: {
            dark: '#000000',
            light: '#FFFFFF'
          }
        });
      } catch (e) {
        console.error('Failed to generate QR for pass:', p.orderId, e);
      }
    }

    await downloadPassPDF(p, qrUrl);

    // Stagger browser downloads to prevent multi-download blocks
    if (i < passes.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 350));
    }
  }
};

/**
 * Share Pass using Web Share API
 */
export const sharePass = async (cardElementId, pass) => {
  const node = document.getElementById(cardElementId);
  if (!node) return;

  try {
    const blob = await toBlob(node, { pixelRatio: 2 });
    if (blob && navigator.canShare && navigator.canShare({ files: [new File([blob], 'pass.png', { type: 'image/png' })] })) {
      const file = new File([blob], `FlashPass_${pass.holderName}_${pass.orderId}.png`, { type: 'image/png' });
      await navigator.share({
        files: [file],
        title: `${pass.holderName}'s Comics Carnival Pass`,
        text: `Here is the entry pass for ${pass.holderName} (Pass ID: ${pass.orderId})! Show this QR at the gate.`
      });
      return;
    }

    if (navigator.share) {
      await navigator.share({
        title: `${pass.holderName}'s Comics Carnival Pass`,
        text: `Here is the entry pass for ${pass.holderName} (Pass ID: ${pass.orderId})! Show this QR at the gate:`,
        url: `${window.location.origin}/pass/${pass.orderId}`
      });
      return;
    }

    // Fallback: save image
    await savePassImage(cardElementId, pass.orderId, pass.holderName);
  } catch (err) {
    if (err.name !== 'AbortError') {
      console.error('Share error', err);
    }
  }
};

const loadImage = src => new Promise((resolve, reject) => {
  const img = new Image();
  img.onload = () => resolve(img);
  img.onerror = reject;
  img.src = src;
});

/**
 * One PNG with every pass in the order stacked (name, badge, days, QR, pass ID), the same
 * details as the PDF. Made for pasting into a WhatsApp chat.
 */
export const passesImageBlob = async (passes) => {
  const W = 720;
  const H = 900;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H * passes.length;
  const ctx = canvas.getContext('2d');
  const fit = (text, max) => {
    let t = String(text || '');
    while (t.length > 1 && ctx.measureText(t).width > max) t = t.slice(0, -1);
    return t === String(text || '') ? t : `${t.slice(0, -1)}…`;
  };
  const center = (text, y, font, color) => {
    ctx.font = font;
    ctx.fillStyle = color;
    ctx.fillText(fit(text, W - 100), W / 2, y);
  };
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  for (let i = 0; i < passes.length; i++) {
    const p = passes[i];
    ctx.save();
    ctx.translate(0, H * i);
    ctx.fillStyle = '#0B0B14';
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = '#FFD60A';
    ctx.lineWidth = 8;
    ctx.strokeRect(20, 20, W - 40, H - 40);

    center('3-DAY COMICS CARNIVAL', 80, 'bold 44px Arial, sans-serif', '#FFD60A');
    center('12-14 DEC 2026 • KOLKATA', 128, 'bold 24px Arial, sans-serif', '#F5F5FA');
    ctx.fillStyle = '#FF2E88';
    ctx.beginPath();
    ctx.roundRect(110, 155, W - 220, 50, 12);
    ctx.fill();
    center(p.badge || '3-DAY ALL ACCESS', 181, 'bold 26px Arial, sans-serif', '#FFFFFF');

    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.roundRect(W / 2 - 220, 230, 440, 440, 18);
    ctx.fill();
    if (p.qrToken) {
      const qr = await loadImage(await QRCode.toDataURL(p.qrToken, { width: 400, margin: 1, color: { dark: '#000000', light: '#FFFFFF' } }));
      ctx.drawImage(qr, W / 2 - 200, 250, 400, 400);
    }

    center(String(p.holderName || 'Guest').toUpperCase(), 712, 'bold 38px Arial, sans-serif', '#FFFFFF');
    const days = p.validDays?.length ? p.validDays.map(d => `[DAY ${d}]`).join('  ') : '[ALL DAYS]';
    center(days, 760, 'bold 28px Arial, sans-serif', '#22D3EE');
    center(`Pass ID: ${p.orderId}`, 808, 'bold 28px Arial, sans-serif', '#FFD60A');
    center(passes.length > 1 ? `Pass ${i + 1} of ${passes.length} • Show this QR at the gate` : 'Show this QR at the gate', 852, 'italic 20px Arial, sans-serif', '#A3A3C2');
    ctx.restore();
  }

  return new Promise((resolve, reject) => canvas.toBlob(b => (b ? resolve(b) : reject(new Error('Could not make the image'))), 'image/png'));
};
