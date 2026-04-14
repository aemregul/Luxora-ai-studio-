import { NextRequest, NextResponse } from 'next/server';

const ROOM_ANGLES = [
  { label: "Geniş Açı - Kapıdan Bakış", prompt: "ultra wide angle shot from the doorway entrance looking into the room, full room visible, architectural photography, same interior design and furniture" },
  { label: "Sol Duvar Perspektifi", prompt: "interior shot from the left wall corner looking across to the right wall, showing depth of the room, same furniture and decor" },
  { label: "Sağ Duvar Perspektifi", prompt: "interior shot from the right wall corner looking across to the left wall, room depth visible, same interior design" },
  { label: "Pencere Yönü", prompt: "shot looking toward the window wall, natural light streaming in, same room furniture and layout" },
  { label: "Karşı Duvar", prompt: "shot from the far end of the room looking back toward the entrance/door, reverse perspective, same interior" },
  { label: "Yukarıdan Bakış (Bird's Eye)", prompt: "bird's eye view from above looking straight down at the room layout, aerial perspective, same furniture arrangement" },
  { label: "Alçak Açı", prompt: "low angle shot from near floor level looking up, dramatic perspective showing ceiling and upper walls, same room design" },
  { label: "Köşe Detay", prompt: "close-up detail shot of a corner of the room, showing material textures, furniture details, decorative objects" },
  { label: "Panoramik 3/4 Açı", prompt: "three-quarter angle wide shot capturing most of the room, slightly elevated perspective, interior architecture photography, same design" },
];

export async function POST(request: NextRequest) {
  try {
    const { image, panelIndex, roomType, designStyle } = await request.json();

    if (!image) {
      return NextResponse.json({ error: 'Görsel gereklidir' }, { status: 400 });
    }

    const FAL_KEY = process.env.FAL_KEY;
    if (!FAL_KEY) {
      return NextResponse.json({ error: 'FAL API anahtarı yapılandırılmamış' }, { status: 500 });
    }

    const idx = panelIndex ?? 0;
    const angle = ROOM_ANGLES[idx] || ROOM_ANGLES[0];

    const roomName = roomType || "room";
    const styleName = designStyle || "luxury";

    const finalPrompt = `Show this exact same ${roomName} interior from a different camera angle: ${angle.prompt}. ` +
      `CRITICAL: Keep the EXACT same room — same furniture, same wall colors, same floor material, same decorations, same lighting style. ` +
      `Only the camera position and angle changes. The room design is ${styleName} style. ` +
      `Photorealistic, 8K, professional architectural photography, magazine quality.`;

    console.log(`=== GRID PANEL ${idx + 1}/9: ${angle.label} ===`);

    // Upload to CDN if base64
    let imageUrl = image;
    if (image.startsWith('data:')) {
      imageUrl = await uploadToFalCDN(image, FAL_KEY);
    }

    let resultUrl: string | null = null;

    // Model 1: Nano Banana Pro Edit
    try {
      const res = await fetch("https://fal.run/fal-ai/nano-banana-pro/edit", {
        method: "POST",
        headers: { "Authorization": `Key ${FAL_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: finalPrompt,
          image_urls: [imageUrl],
          num_images: 1,
          aspect_ratio: "16:9",
          output_format: "png",
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.images?.[0]?.url) resultUrl = data.images[0].url;
      }
    } catch (err) {
      console.error("Nano Banana Pro error:", err);
    }

    // Model 2: Nano Banana 2 Edit (fallback)
    if (!resultUrl) {
      try {
        const res = await fetch("https://fal.run/fal-ai/nano-banana-2/edit", {
          method: "POST",
          headers: { "Authorization": `Key ${FAL_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            prompt: finalPrompt,
            image_urls: [imageUrl],
            num_images: 1,
            aspect_ratio: "16:9",
            output_format: "png",
          }),
        });
        if (res.ok) {
          const data = await res.json();
          if (data.images?.[0]?.url) resultUrl = data.images[0].url;
        }
      } catch (err) {
        console.error("Nano Banana 2 error:", err);
      }
    }

    if (!resultUrl) {
      return NextResponse.json({ error: `Panel ${idx + 1} üretilemedi` }, { status: 500 });
    }

    console.log(`✅ Panel ${idx + 1} başarılı: ${angle.label}`);
    return NextResponse.json({
      success: true,
      imageUrl: resultUrl,
      panelIndex: idx,
      label: angle.label,
    });

  } catch (error) {
    console.error('Grid panel error:', error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Panel üretilemedi'
    }, { status: 500 });
  }
}

// CDN Upload
async function uploadToFalCDN(base64Data: string, apiKey: string): Promise<string> {
  const matches = base64Data.match(/^data:(image\/\w+);base64,(.+)$/);
  if (!matches) throw new Error("Invalid base64");
  const mimeType = matches[1];
  const base64 = matches[2];
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);

  const ext = mimeType.split('/')[1] || 'png';
  const initRes = await fetch("https://fal.run/fal-ai/fal-storage/upload/initiate", {
    method: "POST",
    headers: { "Authorization": `Key ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ file_name: `grid_${Date.now()}.${ext}`, content_type: mimeType }),
  });
  if (!initRes.ok) return base64Data;
  const { upload_url, file_url } = await initRes.json();
  const uploadRes = await fetch(upload_url, { method: "PUT", headers: { "Content-Type": mimeType }, body: bytes });
  return uploadRes.ok ? file_url : base64Data;
}
