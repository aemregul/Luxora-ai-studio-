import { NextRequest, NextResponse } from 'next/server';

const ROOM_ANGLES = [
  { label: "Geniş Açı - Kapıdan Bakış", prompt: "Reposition the camera to the doorway entrance. Ultra wide angle 14mm lens, camera at eye level standing in the doorframe, looking straight into the room. The entire room is visible from wall to wall." },
  { label: "Sol Duvar Perspektifi", prompt: "Reposition the camera to the far left corner of the room. Camera pressed against the left wall, angled 45 degrees to the right, showing the right wall and far wall in a diagonal composition. Strong perspective lines." },
  { label: "Sağ Duvar Perspektifi", prompt: "Reposition the camera to the far right corner of the room. Camera pressed against the right wall, angled 45 degrees to the left, showing the left wall stretching away. Opposite perspective from the left wall shot." },
  { label: "Pencere Yönü - İçeriden Dışa", prompt: "Reposition the camera to face directly toward the window. Camera is inside the room pointing straight at the window, silhouette effect, backlit by natural window light, furniture in foreground as dark shapes against bright window." },
  { label: "Karşı Duvar - Ters Açı", prompt: "Reposition the camera to the opposite end of the room, 180 degree reverse angle. Camera now faces back toward where the original photo was taken. Everything is seen from the reverse direction." },
  { label: "Yukarıdan Bakış (Bird's Eye)", prompt: "Reposition the camera directly above the room center, looking straight down. Top-down bird's eye view, floor plan perspective, all furniture seen from directly above, no walls visible, only floor and furniture tops." },
  { label: "Alçak Açı - Yerden", prompt: "Reposition the camera to floor level, only 20cm above the ground. Extreme low angle looking upward, furniture legs prominent in foreground, ceiling visible, dramatic upward perspective, worm's eye view." },
  { label: "Yakın Çekim Detay", prompt: "Reposition the camera very close to the most interesting furniture piece or decoration, macro-style close-up. Only one item fills most of the frame with sharp detail, shallow depth of field, background blurred." },
  { label: "Panoramik 3/4 Açı", prompt: "Reposition the camera to a high corner near the ceiling. Elevated 3/4 overhead angle looking down diagonally across the entire room, showing the complete layout from above at 45 degrees, like a security camera angle." },
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

    const finalPrompt = `Transform this ${roomName} photo into a COMPLETELY DIFFERENT camera angle. ${angle.prompt}. ` +
      `The room itself stays identical — same furniture, same colors, same materials, same ${styleName} style. ` +
      `But the camera MUST be in a dramatically different position. The resulting image should look like a completely different photo taken in the same room. ` +
      `Professional architectural photography, photorealistic, 8K quality.`;

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
