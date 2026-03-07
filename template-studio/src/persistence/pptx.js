import pptxgen from 'pptxgenjs';

export async function exportToPptx(state) {
  const pres = new pptxgen();

  // Set presentation layout (16:9 is default for 1920x1080)
  pres.layout = 'LAYOUT_169';

  const slide = pres.addSlide();

  // Apply brand background if available
  if (state.brand) {
      // Simple background color mapping for POC
      const bgColor = state.brand.variant === 'dark' ? '1a1a1a' : 'ffffff';
      slide.background = { fill: bgColor };
  }

  const { canvasWidth, canvasHeight, boxes, content } = state;

  boxes.forEach(box => {
    const role = box.metadata?.fieldTypes?.[0] || 'supporting-text';
    const userContent = content[box.id] || "";

    // Convert grid coordinates to percentages/inches for PPTX
    // PPTXGenJS uses inches or percentages. We'll use percentages for simplicity.
    const x = (box.gridX / state.columns) * 100;
    const y = (box.gridY / state.rows) * 100;
    const w = (box.gridWidth / state.columns) * 100;
    const h = (box.gridHeight / state.rows) * 100;

    const isImage = box.metadata?.inputType === 'image' || role === 'logo';

    if (isImage) {
        // Placeholder for images in POC
        slide.addShape(pres.ShapeType.rect, {
            x: `${x}%`, y: `${y}%`, w: `${w}%`, h: `${h}%`,
            fill: { color: 'cccccc' },
            line: { color: '999999', width: 1 }
        });
        slide.addText(`[Image: ${role}]`, {
            x: `${x}%`, y: `${y}%`, w: `${w}%`, h: `${h}%`,
            align: 'center', valign: 'middle',
            fontSize: 10, color: '666666'
        });
    } else {
        // Text box mapping
        const fontSize = mapRoleToFontSize(role);
        const color = state.brand?.variant === 'dark' ? 'ffffff' : '1a1a1a';
        const isHeading = role.includes('title');

        slide.addText(userContent || `[${role}]`, {
            x: `${x}%`, y: `${y}%`, w: `${w}%`, h: `${h}%`,
            fontSize: fontSize,
            color: color,
            bold: isHeading,
            align: 'left',
            valign: 'top',
            margin: 10
        });
    }
  });

  return pres.writeFile({ fileName: `${state.templateName || 'presentation'}.pptx` });
}

function mapRoleToFontSize(role) {
    switch (role) {
        case 'primary-title': return 32;
        case 'secondary-title': return 24;
        case 'section-title': return 20;
        case 'supporting-text': return 14;
        case 'footer': return 10;
        case 'page-number': return 10;
        default: return 12;
    }
}
