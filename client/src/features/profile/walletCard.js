/**
 * Feature 20: wallet-size card (credit-card size, 85.6 x 54 mm) with the blood group in large type, the patient ID and the QR.
 * `qrDataUrl` is a PNG data URL of the QR code. The card deliberately carries no name and no medical details.
 */
export async function buildWalletCard({ patientId, bloodGroup, qrDataUrl }) {
  const { jsPDF } = await import('jspdf'); // loaded only when a card is made
  const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: [85.6, 54] });
  pdf.setFillColor(11, 26, 51);
  pdf.rect(0, 0, 85.6, 54, 'F');
  pdf.setTextColor(255, 255, 255);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(9);
  pdf.text('HealthTwin AI — Emergency Passport', 4, 7);

  pdf.setFontSize(8);
  pdf.setFont('helvetica', 'normal');
  pdf.text('BLOOD GROUP', 4, 18);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(40);
  pdf.setTextColor(255, 90, 90);
  pdf.text(bloodGroup || '?', 4, 36);

  pdf.setTextColor(255, 255, 255);
  pdf.setFont('courier', 'bold');
  pdf.setFontSize(9);
  pdf.text(patientId, 4, 45);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(6);
  pdf.text('Scan for emergency details. Fictional demo project.', 4, 50);

  pdf.setFillColor(255, 255, 255);
  pdf.roundedRect(52, 10, 31, 31, 1.5, 1.5, 'F');
  if (qrDataUrl) pdf.addImage(qrDataUrl, 'PNG', 53.5, 11.5, 28, 28);
  return pdf;
}

/** Draws the QR SVG element onto a canvas and returns a PNG data URL. */
export async function svgToPng(svgEl, size = 600) {
  const xml = new XMLSerializer().serializeToString(svgEl);
  const img = new Image();
  await new Promise((resolve, reject) => {
    img.onload = resolve;
    img.onerror = () => reject(new Error('Could not draw the QR code'));
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(xml)}`;
  });
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, size, size);
  ctx.drawImage(img, 0, 0, size, size);
  return canvas.toDataURL('image/png');
}
