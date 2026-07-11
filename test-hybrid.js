/**
 * Local test of the hybrid text rendering pipeline.
 * Simulates exactly what generateFullPageImage does:
 * 1. Call GPT-4o for layout JSON (fluxPrompt + textOverlay)
 * 2. Call Flux for illustration-only image
 * 3. Build SVG text overlay
 * 4. Composite with sharp
 * 5. Save result to /tmp for inspection
 */
import sharp from "sharp";
import fs from "fs";

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const FAL_KEY = process.env.FAL_KEY;

if (!OPENROUTER_API_KEY) {
  console.error("Missing OPENROUTER_API_KEY");
  process.exit(1);
}
if (!FAL_KEY) {
  console.error("Missing FAL_KEY");
  process.exit(1);
}

const NO_TEXT_SUFFIX = "The image must contain absolutely no text, letters, numbers, words, labels, captions, watermarks, or typography of any kind.";

async function callGPT4o(systemPrompt, userPrompt) {
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "openai/gpt-4o",
      max_tokens: 4000,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "educational_page_layout",
          strict: true,
          schema: {
            type: "object",
            properties: {
              fluxPrompt: { type: "string" },
              textOverlay: {
                type: "array",
                minItems: 1,
                items: {
                  type: "object",
                  properties: {
                    text: { type: "string" },
                    x: { type: "number" },
                    y: { type: "number" },
                    fontSize: { type: "number" },
                    fontWeight: { type: "string", enum: ["normal", "bold"] },
                    color: { type: "string" },
                    align: { type: "string", enum: ["left", "center", "right"] },
                    maxWidth: { anyOf: [{ type: "number" }, { type: "null" }] },
                  },
                  required: ["text", "x", "y", "fontSize", "fontWeight", "color", "align", "maxWidth"],
                  additionalProperties: false,
                },
              },
            },
            required: ["fluxPrompt", "textOverlay"],
            additionalProperties: false,
          },
        },
      },
    }),
  });
  const data = await response.json();
  if (!data.choices || !data.choices[0]) {
    console.error("GPT-4o error:", JSON.stringify(data, null, 2));
    process.exit(1);
  }
  return JSON.parse(data.choices[0].message.content);
}

async function callFlux(prompt) {
  console.log("Calling Flux Pro Ultra...");
  // Submit request
  const submitRes = await fetch("https://queue.fal.run/fal-ai/flux-pro/v1.1-ultra", {
    method: "POST",
    headers: {
      "Authorization": `Key ${FAL_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      prompt,
      aspect_ratio: "3:4",
      output_format: "jpeg",
      safety_tolerance: "6",
    }),
  });
  const submitData = await submitRes.json();
  
  if (submitData.images && submitData.images[0]) {
    return submitData.images[0].url;
  }
  
  // If queued, poll for result
  if (submitData.request_id) {
    const requestId = submitData.request_id;
    console.log("Queued, polling...", requestId);
    for (let i = 0; i < 60; i++) {
      await new Promise(r => setTimeout(r, 3000));
      const statusRes = await fetch(`https://queue.fal.run/fal-ai/flux-pro/v1.1-ultra/requests/${requestId}/status`, {
        headers: { "Authorization": `Key ${FAL_KEY}` },
      });
      const statusText = await statusRes.text();
      let statusData;
      try { statusData = JSON.parse(statusText); } catch { console.log('  status response:', statusText.substring(0, 200)); continue; }
      if (statusData.status === "COMPLETED") {
        const resultRes = await fetch(`https://queue.fal.run/fal-ai/flux-pro/v1.1-ultra/requests/${requestId}`, {
          headers: { "Authorization": `Key ${FAL_KEY}` },
        });
        const resultText = await resultRes.text();
        let resultData;
        try { resultData = JSON.parse(resultText); } catch { console.log('  result parse error:', resultText.substring(0, 200)); continue; }
        if (resultData.images && resultData.images[0]) return resultData.images[0].url;
        console.log('  unexpected result:', JSON.stringify(resultData).substring(0, 200));
        continue;
      }
      if (statusData.status === "FAILED") {
        throw new Error("Flux failed: " + JSON.stringify(statusData));
      }
      console.log("  polling...", statusData.status);
    }
    throw new Error("Flux timed out");
  }
  
  console.error("Unexpected Flux response:", JSON.stringify(submitData, null, 2));
  process.exit(1);
}

function buildTextOverlaySvg(elements, width, height) {
  const scaleFactor = height / 1536;
  
  function clamp(value, min, max) { return Math.min(Math.max(value, min), max); }
  function escapeXml(value) {
    return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  const renderedElements = elements.map(element => {
    const scaledFontSize = Math.max(12, Math.round(clamp(element.fontSize, 6, 96) * scaleFactor));
    const padding = Math.max(6, Math.round(10 * scaleFactor));
    const maxWidthPercent = clamp(element.maxWidth || 90, 5, 100);
    const maxWidthPixels = width * (maxWidthPercent / 100);

    const textX = width * (clamp(element.x, 0, 100) / 100);
    const textY = height * (clamp(element.y, 0, 100) / 100);

    const anchor = element.align === "center" ? "middle" : element.align === "right" ? "end" : "start";

    // Estimate text width for background panel
    const estimatedCharWidth = scaledFontSize * 0.55;
    const estimatedTextWidth = Math.min(maxWidthPixels, element.text.length * estimatedCharWidth);
    const unpaddedTextLeft = element.align === "center" ? textX - estimatedTextWidth / 2 : element.align === "right" ? textX - estimatedTextWidth : textX;
    const panelWidth = Math.min(width - 10, estimatedTextWidth + padding * 2);
    const panelHeight = scaledFontSize + padding * 2;
    const panelX = clamp(unpaddedTextLeft - padding, 5, Math.max(5, width - panelWidth - 5));
    const panelY = clamp(textY - scaledFontSize, 5, Math.max(5, height - panelHeight - 5));

    return `<g>` +
      `<rect x="${panelX.toFixed(1)}" y="${panelY.toFixed(1)}" width="${panelWidth.toFixed(1)}" height="${panelHeight.toFixed(1)}" rx="6" fill="#ffffff" fill-opacity="0.92"/>` +
      `<text x="${textX.toFixed(1)}" y="${textY.toFixed(1)}" font-family="Arial, Helvetica, sans-serif" font-size="${scaledFontSize}" font-weight="${element.fontWeight}" fill="${element.color}" text-anchor="${anchor}">${escapeXml(element.text)}</text>` +
      `</g>`;
  });

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${renderedElements.join("")}</svg>`;
  return Buffer.from(svg);
}

async function main() {
  console.log("=== HYBRID TEXT RENDERING LOCAL TEST ===\n");

  // Step 1: Call GPT-4o for layout
  console.log("Step 1: Calling GPT-4o for page layout...");
  
  const systemPrompt = `You are an elite educational publishing art director.
Design a complete activity page layout for an educational product.

You must return JSON with exactly this shape:
{
  "fluxPrompt": "A detailed prompt for FLUX to generate ONLY the illustration/background/decorative elements. The prompt MUST NOT request any text, letters, numbers, words, or typography. Describe only: background colors/gradients, decorative borders, themed illustrations, mascots, activity area outlines (boxes, lines, grids), and visual layout zones.",
  "textOverlay": [
    {"text": "Page Title", "x": 50, "y": 5, "fontSize": 28, "fontWeight": "bold", "color": "#222222", "align": "center", "maxWidth": 90},
    {"text": "Instructions here", "x": 5, "y": 12, "fontSize": 14, "fontWeight": "normal", "color": "#333333", "align": "left", "maxWidth": 90}
  ]
}

CRITICAL RULES FOR fluxPrompt:
- NEVER include any text, letters, numbers, words, or typography in the image
- Describe blank zones/panels where text will be placed programmatically
- Use phrases like "clean white panel area at top for title" or "empty lined area for writing"
- End the prompt with: "${NO_TEXT_SUFFIX}"

CRITICAL RULES FOR textOverlay:
- x and y are PERCENTAGES (0-100) of the page dimensions
- x=50 means horizontally centered, x=5 means near left edge
- y=5 means near top, y=95 means near bottom
- fontSize is in points (typical range: 10-36)
- Include ALL text that should appear on the page: title, instructions, questions, answer blanks, page number, branding
- Preserve every mandatory text string EXACTLY as given below, without rewriting, correcting, combining, or omitting any of them
- Use "___________________________" for answer lines
- maxWidth is a percentage (use 90 by default) to prevent text overflow
- Use hexadecimal colors only, such as #222222
- You MUST include EVERY SINGLE item from the MANDATORY EXACT TEXT MANIFEST in your textOverlay array`;

  const userPrompt = `Design the illustration and programmatic text layout for page 2 of 3 of a worksheet.

PAGE TYPE:
Activity page - Math practice worksheet for young children

AUDIENCE:
Pre-K to 1st Grade (ages 4-6)

CREATIVE DIRECTION:
Baby dinosaur theme, colorful jungle background, playful and fun

CUSTOM-DIRECTION RULE:
Use the supplied generator-specific creative direction as the primary visual theme.

LAYOUT GUIDANCE:
The page should have a clear title at the top, simple instructions, and 5 math problems with answer lines.

STYLE AND TYPOGRAPHY GUIDANCE:
Bold colorful title, clean readable body text, child-friendly design

FUNCTIONAL REQUIREMENTS:
1. The page must be immediately usable when printed.
2. Must include 5 addition problems appropriate for Pre-K to 1st grade.
3. Each problem must have a clear answer line.

MANDATORY EXACT TEXT MANIFEST (you MUST include ALL of these in textOverlay):
- "Math with Baby Dino"
- "Solve each problem and write your answer on the line!"
- "1.  2 + 1 = ___"
- "2.  3 + 2 = ___"
- "3.  1 + 4 = ___"
- "4.  2 + 3 = ___"
- "5.  4 + 1 = ___"
- "Name: ___________________________"
- "Page 2 of 3"
- "WishesWithoutBordersCo"

Return the JSON layout only. Put every mandatory text string in textOverlay and keep fluxPrompt strictly illustration-only. Design a flat, edge-to-edge, print-ready portrait page with safe margins, readable blank content zones, complete functional activity areas, and no mockup, desk, hands, photographed paper, or surrounding scene.`;

  const layout = await callGPT4o(systemPrompt, userPrompt);
  console.log("\nGPT-4o returned layout:");
  console.log("  fluxPrompt:", layout.fluxPrompt.substring(0, 100) + "...");
  console.log("  textOverlay items:", layout.textOverlay.length);
  layout.textOverlay.forEach((item, i) => {
    console.log(`    [${i}] "${item.text}" at (${item.x}%, ${item.y}%) size=${item.fontSize} ${item.fontWeight}`);
  });

  // Step 2: Call Flux for illustration
  console.log("\nStep 2: Calling Flux for illustration-only image...");
  const trimmedFluxPrompt = layout.fluxPrompt.trim().replace(/[\.\s]+$/, "");
  const fluxPrompt = `${trimmedFluxPrompt}. ${NO_TEXT_SUFFIX}`;
  console.log("  Flux prompt:", fluxPrompt.substring(0, 150) + "...");
  
  const imageUrl = await callFlux(fluxPrompt);
  console.log("  Got image URL:", imageUrl.substring(0, 80) + "...");

  // Step 3: Download and get dimensions
  console.log("\nStep 3: Downloading image...");
  const imageRes = await fetch(imageUrl);
  const imageBuffer = Buffer.from(await imageRes.arrayBuffer());
  const metadata = await sharp(imageBuffer).metadata();
  console.log(`  Image dimensions: ${metadata.width}x${metadata.height}`);

  // Step 4: Build SVG overlay
  console.log("\nStep 4: Building SVG text overlay...");
  const svgBuffer = buildTextOverlaySvg(layout.textOverlay, metadata.width, metadata.height);
  fs.writeFileSync("/tmp/test-overlay-only.svg", svgBuffer);
  console.log("  SVG saved to /tmp/test-overlay-only.svg");

  // Step 5: Composite
  console.log("\nStep 5: Compositing...");
  const compositedBuffer = await sharp(imageBuffer)
    .composite([{ input: svgBuffer }])
    .jpeg({ quality: 90, progressive: true })
    .toBuffer();
  
  fs.writeFileSync("/tmp/test-hybrid-result.jpg", compositedBuffer);
  console.log("  Final result saved to /tmp/test-hybrid-result.jpg");
  
  // Also save the raw Flux image for comparison
  fs.writeFileSync("/tmp/test-flux-raw.jpg", imageBuffer);
  console.log("  Raw Flux image saved to /tmp/test-flux-raw.jpg");
  
  // Also render SVG alone on white background for inspection
  await sharp(svgBuffer)
    .flatten({ background: { r: 255, g: 255, b: 255 } })
    .png()
    .toFile("/tmp/test-overlay-rendered.png");
  console.log("  SVG overlay rendered to /tmp/test-overlay-rendered.png");

  console.log("\n=== DONE ===");
  console.log("Check /tmp/test-hybrid-result.jpg for the final composited page");
}

main().catch(err => {
  console.error("FATAL:", err);
  process.exit(1);
});
