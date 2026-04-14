import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const { image, mask, prompt } = await request.json();

    if (!image || !mask) {
      return NextResponse.json({ error: 'Görsel ve maske gereklidir' }, { status: 400 });
    }

    const FAL_KEY = process.env.FAL_KEY;
    if (!FAL_KEY) {
      return NextResponse.json({ error: 'FAL API anahtarı yapılandırılmamış' }, { status: 500 });
    }

    console.log("=== LUXORA INPAINT ===");
    console.log("Prompt:", prompt || "(boş - silme modu)");

    // Upload image & mask to Fal CDN
    let imageUrl = image;
    let maskUrl = mask;

    if (image.startsWith('data:')) {
      imageUrl = await uploadToFalCDN(image, FAL_KEY);
    }
    if (mask.startsWith('data:')) {
      maskUrl = await uploadToFalCDN(mask, FAL_KEY);
    }

    console.log("Image URL:", imageUrl.substring(0, 60) + "...");
    console.log("Mask URL:", maskUrl.substring(0, 60) + "...");

    // Build prompt
    const inpaintPrompt = prompt && prompt.trim()
      ? `${prompt.trim()}. Seamlessly blend with the surrounding area. Photorealistic, matching lighting and perspective exactly.`
      : "Remove the masked area and fill with a natural continuation of the surrounding environment. Seamlessly blend, photorealistic.";

    let resultUrl: string | null = null;

    // Model 1: Nano Banana Pro Inpaint
    try {
      console.log("Model 1: Nano Banana Pro Inpaint...");
      resultUrl = await inpaintWithNanoBananaPro(imageUrl, maskUrl, inpaintPrompt, FAL_KEY);
      console.log("✅ Nano Banana Pro Inpaint başarılı!");
    } catch (err) {
      console.error("❌ Nano Banana Pro Inpaint hatası:", err);
    }

    // Model 2: FLUX Fill Pro
    if (!resultUrl) {
      try {
        console.log("Model 2: FLUX Fill Pro...");
        resultUrl = await inpaintWithFluxFill(imageUrl, maskUrl, inpaintPrompt, FAL_KEY);
        console.log("✅ FLUX Fill başarılı!");
      } catch (err) {
        console.error("❌ FLUX Fill hatası:", err);
      }
    }

    // Model 3: Bria Eraser (son çare - obje silme)
    if (!resultUrl) {
      try {
        console.log("Model 3: Bria Eraser...");
        resultUrl = await inpaintWithBriaEraser(imageUrl, maskUrl, FAL_KEY);
        console.log("✅ Bria Eraser başarılı!");
      } catch (err) {
        console.error("❌ Bria Eraser hatası:", err);
        throw new Error("Inpainting başarısız. Lütfen tekrar deneyin.");
      }
    }

    return NextResponse.json({ success: true, resultImage: resultUrl });

  } catch (error) {
    console.error('Inpaint error:', error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Inpainting başarısız'
    }, { status: 500 });
  }
}

// Model 1: Nano Banana Pro Inpaint
async function inpaintWithNanoBananaPro(imageUrl: string, maskUrl: string, prompt: string, apiKey: string): Promise<string> {
  const res = await fetch("https://fal.run/fal-ai/nano-banana-pro/inpaint", {
    method: "POST",
    headers: { "Authorization": `Key ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      prompt,
      image_url: imageUrl,
      mask_url: maskUrl,
      num_images: 1,
      output_format: "png",
    }),
  });
  if (!res.ok) throw new Error(`Nano Banana Pro Inpaint: ${res.status} - ${await res.text()}`);
  const data = await res.json();
  if (data.images?.[0]?.url) return data.images[0].url;
  throw new Error("No images");
}

// Model 2: FLUX Fill Pro
async function inpaintWithFluxFill(imageUrl: string, maskUrl: string, prompt: string, apiKey: string): Promise<string> {
  const res = await fetch("https://fal.run/fal-ai/flux-pro/v1.1/fill", {
    method: "POST",
    headers: { "Authorization": `Key ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      prompt,
      image_url: imageUrl,
      mask_url: maskUrl,
      output_format: "png",
    }),
  });
  if (!res.ok) throw new Error(`FLUX Fill: ${res.status} - ${await res.text()}`);
  const data = await res.json();
  if (data.images?.[0]?.url) return data.images[0].url;
  throw new Error("No images");
}

// Model 3: Bria Eraser
async function inpaintWithBriaEraser(imageUrl: string, maskUrl: string, apiKey: string): Promise<string> {
  const res = await fetch("https://fal.run/fal-ai/bria/eraser", {
    method: "POST",
    headers: { "Authorization": `Key ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ image_url: imageUrl, mask_url: maskUrl }),
  });
  if (!res.ok) throw new Error(`Bria Eraser: ${res.status} - ${await res.text()}`);
  const data = await res.json();
  if (data.image?.url) return data.image.url;
  throw new Error("No image");
}

// CDN Upload
async function uploadToFalCDN(base64Data: string, apiKey: string): Promise<string> {
  const matches = base64Data.match(/^data:(image\/\w+);base64,(.+)$/);
  if (!matches) throw new Error("Invalid base64");

  const mimeType = matches[1];
  const base64 = matches[2];
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }

  const ext = mimeType.split('/')[1] || 'png';
  const initRes = await fetch("https://fal.run/fal-ai/fal-storage/upload/initiate", {
    method: "POST",
    headers: { "Authorization": `Key ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ file_name: `inpaint_${Date.now()}.${ext}`, content_type: mimeType }),
  });

  if (!initRes.ok) return base64Data;
  const { upload_url, file_url } = await initRes.json();

  const uploadRes = await fetch(upload_url, {
    method: "PUT",
    headers: { "Content-Type": mimeType },
    body: bytes,
  });

  return uploadRes.ok ? file_url : base64Data;
}
