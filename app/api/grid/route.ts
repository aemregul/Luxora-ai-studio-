import { NextRequest, NextResponse } from 'next/server';

const ROOM_ANGLES = [
  { label: "Geniş Açı - Kapıdan Bakış", prompt: "ultra wide angle architectural photograph taken from the entrance doorway looking into the room, 14mm lens, standing in doorframe, entire room visible wall to wall, strong vanishing point perspective, eye level" },
  { label: "Sol Duvar Perspektifi", prompt: "architectural photograph taken from the far left corner of the room, camera pressed against the left wall, 45 degree diagonal view toward the opposite corner, strong converging perspective lines" },
  { label: "Sağ Duvar Perspektifi", prompt: "architectural photograph taken from the far right corner of the room, camera against the right wall aiming diagonally left, dramatic depth perspective toward the far corner" },
  { label: "Pencere Yönü", prompt: "interior photograph facing directly toward the window, strong backlight, bright natural light flooding through window glass, furniture silhouetted against bright window, dramatic contre-jour lighting" },
  { label: "Karşı Duvar - Ters Açı", prompt: "interior photograph taken from the back wall, 180 degree reverse view, camera faces the entrance door, showing the room from the completely opposite direction" },
  { label: "Yukarıdan Bakış (Bird's Eye)", prompt: "bird's eye view photograph looking straight down from ceiling, top-down aerial perspective, floor plan view, all furniture seen from directly above, no walls visible, only floor and furniture tops" },
  { label: "Alçak Açı - Yerden", prompt: "extreme low angle photograph taken from floor level, 20cm above ground, worm's eye view looking up, furniture legs prominent in foreground, ceiling visible, dramatic upward perspective" },
  { label: "Yakın Çekim Detay", prompt: "close-up macro photograph of room details, one decorative object or furniture texture filling the frame, shallow depth of field, bokeh background, material texture detail" },
  { label: "Panoramik 3/4 Açı", prompt: "elevated 3/4 overhead photograph from a high corner near the ceiling, looking down diagonally at 45 degrees, showing the complete room layout, elevated perspective" },
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

    // Upload to CDN if base64
    let imageUrl = image;
    if (image.startsWith('data:')) {
      imageUrl = await uploadToFalCDN(image, FAL_KEY);
    }

    const finalPrompt = `Transform this ${roomName} photo into a completely different camera angle. ${angle.prompt}. ` +
      `Same room, same furniture, same ${styleName} style. Different camera position. ` +
      `Photorealistic, 8K, professional architectural photography.`;

    console.log(`=== GRID PANEL ${idx + 1}/9: ${angle.label} ===`);

    let resultUrl: string | null = null;

    // Nano Banana Pro Edit
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
      } else {
        console.error("Nano Banana Pro error:", await res.text());
      }
    } catch (err) {
      console.error("Nano Banana Pro error:", err);
    }

    // Fallback: Nano Banana 2 Edit
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
