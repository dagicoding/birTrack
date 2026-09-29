/* ============================================================================
   PDF EXPORT MODULE  (pdf-export.js)
   Replaces the old JSON import/export with a printable PDF statement of the
   currently filtered/visible transactions, built with jsPDF + autotable.

   Two fonts are embedded so the report renders correctly everywhere:
     - Noto Sans (Latin, incl. "ī")   — used for all Latin text
     - Noto Sans Ethiopic            — used automatically for any cell whose
                                        note/source contains Ge'ez script
   Both are loaded lazily (only once, the first time an export happens) so
   they don't add weight to the initial page load.
   ============================================================================ */
const PdfExport = (function(){
  let fontsRegistered = false;
  const ETHIOPIC_RE = /[\u1200-\u137F\u1380-\u139F]/;

  function loadScriptOnce(src){
    return new Promise((resolve, reject)=>{
      if(document.querySelector(`script[data-pdf-asset="${src}"]`)){ resolve(); return; }
      const s = document.createElement('script');
      s.src = src; s.dataset.pdfAsset = src;
      s.onload = ()=>resolve();
      s.onerror = ()=>reject(new Error('Failed to load '+src));
      document.head.appendChild(s);
    });
  }

  function ensureLibsLoaded(){
    if(window.jspdf && window.jspdf.jsPDF) return Promise.resolve();
    return loadScriptOnce('https://cdn.jsdelivr.net/npm/jspdf@4.2.1/dist/jspdf.umd.min.js')
      .then(()=> loadScriptOnce('https://cdn.jsdelivr.net/npm/jspdf-autotable@5.0.8/dist/jspdf.plugin.autotable.min.js'));
  }

  function ensureFontScriptsLoaded(){
    if(window.__FONT_NotoSansRegular__) return Promise.resolve();
    return Promise.all([
      loadScriptOnce('js/fonts/notosans_regular_base64.js'),
      loadScriptOnce('js/fonts/notosans_bold_base64.js'),
      loadScriptOnce('js/fonts/notosansethiopic_regular_base64.js')
    ]);
  }

  function registerFonts(doc){
    if(fontsRegistered) return;
    doc.addFileToVFS('NotoSans-Regular.ttf', window.__FONT_NotoSansRegular__);
    doc.addFont('NotoSans-Regular.ttf', 'NotoSans', 'normal');
    doc.addFileToVFS('NotoSans-Bold.ttf', window.__FONT_NotoSansBold__);
    doc.addFont('NotoSans-Bold.ttf', 'NotoSans', 'bold');
    doc.addFileToVFS('NotoSansEthiopic-Regular.ttf', window.__FONT_NotoSansEthiopicRegular__);
    doc.addFont('NotoSansEthiopic-Regular.ttf', 'NotoSansEthiopic', 'normal');
    fontsRegistered = true;
  }

  function fontForText(str){ return ETHIOPIC_RE.test(str||'') ? 'NotoSansEthiopic' : 'NotoSans'; }

  async function exportStatement(opts){
    const { records, periodLabel, balanceHidden, currencyFormatter } = opts;
    await ensureLibsLoaded();
    await ensureFontScriptsLoaded();

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit:'pt', format:'a4' });
    registerFonts(doc);
    doc.setFont('NotoSans','normal');

    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 40;

    /* ---- Header ---- */
    doc.setFillColor(20,29,24);
    doc.roundedRect(margin, 36, 34, 34, 9, 9, 'F');
    doc.setFont('NotoSansEthiopic','normal');
    doc.setTextColor(255,255,255);
    doc.setFontSize(17);
    doc.text('\u1265', margin+17, 58, { align:'center' }); // "ብ" glyph

    doc.setFont('NotoSans','bold');
    doc.setTextColor(20,29,24);
    doc.setFontSize(18);
    doc.text('B\u012Br Income Statement', margin+46, 52);
    doc.setFont('NotoSans','normal');
    doc.setFontSize(10);
    doc.setTextColor(110,120,112);
    doc.text('Period: ' + periodLabel, margin+46, 66);

    doc.setFontSize(9);
    doc.text('Generated ' + new Date().toLocaleString('en-GB',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}), pageWidth - margin, 44, { align:'right' });

    /* ---- Summary line ---- */
    const total = records.reduce((sum,r)=> sum + (Number(r.amount)||0), 0);
    const summaryY = 96;
    doc.setDrawColor(225,229,224);
    doc.line(margin, summaryY, pageWidth-margin, summaryY);
    doc.setFont('NotoSans','bold');
    doc.setFontSize(11);
    doc.setTextColor(20,29,24);
    const totalLabel = balanceHidden ? '\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022' : ('ETB ' + currencyFormatter(total));
    doc.text('Total: ' + totalLabel, margin, summaryY+20);
    doc.setFont('NotoSans','normal');
    doc.setFontSize(10);
    doc.setTextColor(110,120,112);
    doc.text(records.length + ' transaction' + (records.length===1?'':'s'), pageWidth-margin, summaryY+20, { align:'right' });

    /* ---- Table ---- */
    const rows = records.map(r=>[
      Calendar.formatEthiopian(r.ethiopianDate),
      r.source,
      r.note || '\u2014',
      balanceHidden ? '\u2022\u2022\u2022\u2022' : ('ETB ' + currencyFormatter(r.amount))
    ]);

    doc.autoTable({
      startY: summaryY + 36,
      head: [['Ethiopian Date', 'Source', 'Note', 'Amount']],
      body: rows,
      styles: { font:'NotoSans', fontSize:9.5, cellPadding:7, textColor:[26,36,30], lineColor:[232,235,229], lineWidth:0.5 },
      headStyles: { font:'NotoSans', fontStyle:'bold', fillColor:[20,29,24], textColor:[255,255,255] },
      alternateRowStyles: { fillColor:[247,249,246] },
      columnStyles: {
        0:{ cellWidth:100 },
        3:{ halign:'right', cellWidth:90 }
      },
      margin:{ left:margin, right:margin },
      didParseCell: function(data){
        if(data.section==='body'){
          data.cell.styles.font = fontForText(String(data.cell.raw));
        }
      },
      didDrawPage: function(){
        const str = 'Page ' + doc.internal.getNumberOfPages();
        doc.setFont('NotoSans','normal');
        doc.setFontSize(8.5);
        doc.setTextColor(150,158,150);
        doc.text(str, pageWidth-margin, doc.internal.pageSize.getHeight()-20, { align:'right' });
        doc.text('B\u012Br Income Tracker', margin, doc.internal.pageSize.getHeight()-20);
      }
    });

    const filename = 'bir-income-statement-' + Date.now() + '.pdf';
    doc.save(filename);
    return filename;
  }

  return { exportStatement };
})();
