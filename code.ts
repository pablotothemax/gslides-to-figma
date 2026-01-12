// GSlides → Figma Plugin
// Imports Google Slides presentations into Figma frames

interface ColorRGB {
  r: number;
  g: number;
  b: number;
}

interface TextRun {
  text: string;
  fontFamily: string;
  fontSize: number;
  fontWeight: number;
  fontStyle: string;
  color: ColorRGB;
  underline: boolean;
  strikethrough: boolean;
}

interface TextContent {
  runs: TextRun[];
}

interface SlideElement {
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  scaleX: number;
  scaleY: number;
  rotation: number;
  // Shape properties
  shapeType?: string;
  fillColor?: ColorRGB | null;
  strokeColor?: ColorRGB | null;
  strokeWeight?: number;
  text?: TextContent | null;
  // Image properties
  imageUrl?: string;
  // Table properties
  rows?: string[][];
  rowCount?: number;
  columnCount?: number;
  // Group properties
  children?: SlideElement[];
}

interface Slide {
  index: number;
  elements: SlideElement[];
}

interface Presentation {
  title: string;
  pageSize: {
    width: { magnitude: number; unit: string };
    height: { magnitude: number; unit: string };
  };
  slides: Slide[];
}

interface ImportMessage {
  type: 'import-slides';
  presentation: Presentation;
  imageData: Record<string, string>;
}

// Font fallback mapping
const FONT_FALLBACKS: Record<string, string> = {
  // Sans-serif fonts
  'Arial': 'Inter',
  'Helvetica': 'Inter',
  'Roboto': 'Inter',
  'Open Sans': 'Inter',
  'Lato': 'Inter',
  'Montserrat': 'Inter',
  'Source Sans Pro': 'Inter',
  'Nunito': 'Inter',
  'Poppins': 'Inter',
  // Serif fonts
  'Times New Roman': 'Georgia',
  'Georgia': 'Georgia',
  'Playfair Display': 'Georgia',
  'Merriweather': 'Georgia',
  'Lora': 'Georgia',
  // Monospace fonts
  'Courier New': 'Roboto Mono',
  'Consolas': 'Roboto Mono',
  'Monaco': 'Roboto Mono',
  'Source Code Pro': 'Roboto Mono',
};

// Common system fonts to try
const SYSTEM_FONTS = ['Inter', 'Roboto', 'Arial', 'Helvetica', 'Georgia'];

// Show the UI
figma.showUI(__html__, { width: 360, height: 420 });

// Handle messages from UI
figma.ui.onmessage = async (msg: ImportMessage | { type: string }) => {
  if (msg.type === 'import-slides') {
    const importMsg = msg as ImportMessage;
    try {
      await importPresentation(importMsg.presentation, importMsg.imageData);
    } catch (err) {
      figma.ui.postMessage({
        type: 'error',
        message: err instanceof Error ? err.message : 'Failed to import slides'
      });
    }
  } else if (msg.type === 'cancel') {
    figma.closePlugin();
  }
};

async function importPresentation(presentation: Presentation, imageData: Record<string, string>) {
  const slides = presentation.slides;
  const totalSlides = slides.length;

  if (totalSlides === 0) {
    figma.ui.postMessage({ type: 'error', message: 'No slides found in presentation' });
    return;
  }

  // Convert page size from EMU to pixels
  const emuToPixels = (emu: number) => (emu || 0) / 914400 * 72;
  const slideWidth = emuToPixels(presentation.pageSize?.width?.magnitude || 9144000);
  const slideHeight = emuToPixels(presentation.pageSize?.height?.magnitude || 5143500);

  const createdFrames: FrameNode[] = [];
  const spacing = 100; // Space between slides

  for (let i = 0; i < slides.length; i++) {
    const slide = slides[i];

    figma.ui.postMessage({
      type: 'progress',
      percent: 60 + (i / totalSlides) * 35,
      text: `Creating slide ${i + 1} of ${totalSlides}...`
    });

    // Create frame for slide
    const frame = figma.createFrame();
    frame.name = `Slide ${i + 1}`;
    frame.resize(slideWidth, slideHeight);
    frame.x = i * (slideWidth + spacing);
    frame.y = 0;
    frame.fills = [{ type: 'SOLID', color: { r: 1, g: 1, b: 1 } }];

    // Create elements within the frame
    await createElements(frame, slide.elements, imageData);

    figma.currentPage.appendChild(frame);
    createdFrames.push(frame);
  }

  // Select all created frames and zoom to fit
  figma.currentPage.selection = createdFrames;
  figma.viewport.scrollAndZoomIntoView(createdFrames);

  figma.ui.postMessage({
    type: 'complete',
    slideCount: totalSlides
  });
}

async function createElements(
  parent: FrameNode | GroupNode,
  elements: SlideElement[],
  imageData: Record<string, string>
) {
  for (const element of elements) {
    try {
      await createElement(parent, element, imageData);
    } catch (err) {
      console.error('Failed to create element:', err);
    }
  }
}

async function createElement(
  parent: FrameNode | GroupNode,
  element: SlideElement,
  imageData: Record<string, string>
) {
  // Apply scale to dimensions
  const width = Math.max(1, element.width * Math.abs(element.scaleX));
  const height = Math.max(1, element.height * Math.abs(element.scaleY));
  const x = element.x;
  const y = element.y;

  switch (element.type) {
    case 'shape':
      await createShape(parent, element, x, y, width, height);
      break;
    case 'image':
      await createImage(parent, element, x, y, width, height, imageData);
      break;
    case 'line':
      createLine(parent, element, x, y, width, height);
      break;
    case 'table':
      await createTable(parent, element, x, y, width, height);
      break;
    case 'group':
      await createGroup(parent, element, x, y, imageData);
      break;
  }
}

async function createShape(
  parent: FrameNode | GroupNode,
  element: SlideElement,
  x: number,
  y: number,
  width: number,
  height: number
) {
  let node: SceneNode;

  // Create appropriate shape based on type
  const shapeType = element.shapeType || 'RECTANGLE';

  if (shapeType === 'ELLIPSE') {
    const ellipse = figma.createEllipse();
    ellipse.resize(width, height);
    node = ellipse;
  } else if (shapeType === 'ROUND_RECTANGLE') {
    const rect = figma.createRectangle();
    rect.resize(width, height);
    rect.cornerRadius = Math.min(width, height) * 0.1;
    node = rect;
  } else {
    // Default to rectangle for most shapes
    const rect = figma.createRectangle();
    rect.resize(width, height);
    node = rect;
  }

  // Position
  node.x = x;
  node.y = y;

  // Apply fill
  if (element.fillColor && 'fills' in node) {
    node.fills = [{
      type: 'SOLID',
      color: element.fillColor
    }];
  } else if ('fills' in node) {
    node.fills = [];
  }

  // Apply stroke
  if (element.strokeColor && element.strokeWeight && 'strokes' in node) {
    node.strokes = [{
      type: 'SOLID',
      color: element.strokeColor
    }];
    node.strokeWeight = element.strokeWeight;
  }

  // Apply rotation
  if (element.rotation && element.rotation !== 0) {
    node.rotation = -element.rotation; // Figma uses opposite direction
  }

  parent.appendChild(node);

  // Handle text content
  if (element.text && element.text.runs.length > 0) {
    await createTextForShape(parent, element, x, y, width, height);
  }
}

async function createTextForShape(
  parent: FrameNode | GroupNode,
  element: SlideElement,
  x: number,
  y: number,
  width: number,
  height: number
) {
  if (!element.text) return;

  const textNode = figma.createText();
  textNode.x = x + 8; // Padding
  textNode.y = y + 8;

  // Combine all text runs
  const fullText = element.text.runs.map(r => r.text).join('');
  if (!fullText.trim()) return;

  // Load fonts and set text
  const firstRun = element.text.runs[0];
  const fontName = await loadFont(firstRun.fontFamily, firstRun.fontWeight);

  textNode.fontName = fontName;
  textNode.characters = fullText;
  textNode.fontSize = firstRun.fontSize || 14;
  textNode.fills = [{ type: 'SOLID', color: firstRun.color }];

  // Set text box size
  textNode.resize(Math.max(1, width - 16), Math.max(1, height - 16));
  textNode.textAutoResize = 'HEIGHT';

  // Apply rotation if needed
  if (element.rotation && element.rotation !== 0) {
    textNode.rotation = -element.rotation;
  }

  parent.appendChild(textNode);
}

async function createImage(
  parent: FrameNode | GroupNode,
  element: SlideElement,
  x: number,
  y: number,
  width: number,
  height: number,
  imageData: Record<string, string>
) {
  const imageUrl = element.imageUrl;
  if (!imageUrl) return;

  const base64Data = imageData[imageUrl];
  if (!base64Data) {
    // Create placeholder rectangle if image couldn't be loaded
    const placeholder = figma.createRectangle();
    placeholder.x = x;
    placeholder.y = y;
    placeholder.resize(width, height);
    placeholder.fills = [{ type: 'SOLID', color: { r: 0.9, g: 0.9, b: 0.9 } }];
    placeholder.name = 'Image (failed to load)';
    parent.appendChild(placeholder);
    return;
  }

  try {
    // Extract base64 content and mime type
    const matches = base64Data.match(/^data:([^;]+);base64,(.+)$/);
    if (!matches) {
      throw new Error('Invalid base64 data');
    }

    const base64Content = matches[2];
    const bytes = figma.base64Decode(base64Content);

    // Create image
    const image = figma.createImage(bytes);

    // Create rectangle with image fill
    const rect = figma.createRectangle();
    rect.x = x;
    rect.y = y;
    rect.resize(width, height);
    rect.fills = [{
      type: 'IMAGE',
      imageHash: image.hash,
      scaleMode: 'FILL'
    }];
    rect.name = 'Image';

    // Apply rotation
    if (element.rotation && element.rotation !== 0) {
      rect.rotation = -element.rotation;
    }

    parent.appendChild(rect);
  } catch (err) {
    console.error('Failed to create image:', err);
    // Create placeholder on error
    const placeholder = figma.createRectangle();
    placeholder.x = x;
    placeholder.y = y;
    placeholder.resize(width, height);
    placeholder.fills = [{ type: 'SOLID', color: { r: 0.9, g: 0.9, b: 0.9 } }];
    placeholder.name = 'Image (error)';
    parent.appendChild(placeholder);
  }
}

function createLine(
  parent: FrameNode | GroupNode,
  element: SlideElement,
  x: number,
  y: number,
  width: number,
  height: number
) {
  const line = figma.createLine();
  line.x = x;
  line.y = y;

  // Resize line (lines have width but height of 0)
  const lineLength = Math.sqrt(width * width + height * height);
  line.resize(lineLength, 0);

  // Calculate rotation based on width/height ratio
  if (width !== 0 || height !== 0) {
    const angle = Math.atan2(height, width) * (180 / Math.PI);
    line.rotation = -angle;
  }

  // Apply stroke
  if (element.strokeColor) {
    line.strokes = [{
      type: 'SOLID',
      color: element.strokeColor
    }];
  }
  line.strokeWeight = element.strokeWeight || 1;

  parent.appendChild(line);
}

async function createTable(
  parent: FrameNode | GroupNode,
  element: SlideElement,
  x: number,
  y: number,
  width: number,
  height: number
) {
  const rows = element.rows || [];
  const rowCount = rows.length;
  const colCount = rows[0]?.length || 0;

  if (rowCount === 0 || colCount === 0) return;

  // Create a frame to hold the table
  const tableFrame = figma.createFrame();
  tableFrame.name = 'Table';
  tableFrame.x = x;
  tableFrame.y = y;
  tableFrame.resize(width, height);
  tableFrame.fills = [];

  const cellWidth = width / colCount;
  const cellHeight = height / rowCount;

  // Load a default font
  const fontName = await loadFont('Arial', 400);

  for (let row = 0; row < rowCount; row++) {
    for (let col = 0; col < colCount; col++) {
      const cellText = rows[row]?.[col] || '';

      // Create cell background
      const cell = figma.createRectangle();
      cell.x = col * cellWidth;
      cell.y = row * cellHeight;
      cell.resize(cellWidth, cellHeight);
      cell.fills = [{ type: 'SOLID', color: { r: 1, g: 1, b: 1 } }];
      cell.strokes = [{ type: 'SOLID', color: { r: 0.8, g: 0.8, b: 0.8 } }];
      cell.strokeWeight = 1;
      tableFrame.appendChild(cell);

      // Create cell text
      if (cellText.trim()) {
        const textNode = figma.createText();
        textNode.fontName = fontName;
        textNode.characters = cellText;
        textNode.fontSize = 10;
        textNode.x = col * cellWidth + 4;
        textNode.y = row * cellHeight + 4;
        textNode.resize(cellWidth - 8, cellHeight - 8);
        textNode.textAutoResize = 'TRUNCATE';
        tableFrame.appendChild(textNode);
      }
    }
  }

  parent.appendChild(tableFrame);
}

async function createGroup(
  parent: FrameNode | GroupNode,
  element: SlideElement,
  x: number,
  y: number,
  imageData: Record<string, string>
) {
  if (!element.children || element.children.length === 0) return;

  // Create elements and group them
  const nodes: SceneNode[] = [];

  for (const child of element.children) {
    // Offset child positions by group position
    const childElement = {
      ...child,
      x: x + child.x,
      y: y + child.y
    };

    await createElement(parent, childElement, imageData);
  }
}

async function loadFont(fontFamily: string, fontWeight: number): Promise<FontName> {
  // Determine style based on weight
  const style = fontWeight >= 700 ? 'Bold' : 'Regular';

  // Try to load the exact font
  try {
    const fontName = { family: fontFamily, style };
    await figma.loadFontAsync(fontName);
    return fontName;
  } catch {
    // Font not available
  }

  // Try fallback from mapping
  const fallbackFamily = FONT_FALLBACKS[fontFamily];
  if (fallbackFamily) {
    try {
      const fontName = { family: fallbackFamily, style };
      await figma.loadFontAsync(fontName);
      return fontName;
    } catch {
      // Fallback not available either
    }
  }

  // Determine font category for generic fallback
  const isSerif = /serif|georgia|times|garamond|palatino/i.test(fontFamily);
  const isMono = /mono|courier|consolas|code/i.test(fontFamily);

  // Try system fonts based on category
  const fallbackList = isMono
    ? ['Roboto Mono', 'Courier New']
    : isSerif
      ? ['Georgia', 'Times New Roman']
      : ['Inter', 'Roboto', 'Arial'];

  for (const fallback of fallbackList) {
    try {
      const fontName = { family: fallback, style };
      await figma.loadFontAsync(fontName);
      return fontName;
    } catch {
      continue;
    }
  }

  // Last resort: try Inter Regular
  try {
    const fontName = { family: 'Inter', style: 'Regular' };
    await figma.loadFontAsync(fontName);
    return fontName;
  } catch {
    // Even Inter failed, try Arial
    const fontName = { family: 'Arial', style: 'Regular' };
    await figma.loadFontAsync(fontName);
    return fontName;
  }
}
