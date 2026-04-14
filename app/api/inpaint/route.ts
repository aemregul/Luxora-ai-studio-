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

    const isRemoveMode = !prompt || !prompt.trim();
    console.log("=== LUXORA INPAINT ===");
    console.log("Mode:", isRemoveMode ? "REMOVE (silme)" : "REPLACE (değiştirme)");
    console.log("Prompt:", prompt || "(boş)");

    // Upload image & mask to Fal CDN
    let imageUrl = image;
    let maskUrl = mask;

    if (image.startsWith('data:')) {
      imageUrl = await uploadToFalCDN(image, FAL_KEY);
    }
    if (mask.startsWith('data:')) {
      maskUrl = await uploadToFalCDN(mask, FAL_KEY);
    }

    let resultUrl: string | null = null;

    if (isRemoveMode) {
      // ========== REMOVE MODE ==========
      // Bria Eraser first — purpose-built for clean object removal
      // Preserves surrounding textures (carpets, walls etc.) perfectly

      // Model 1: Bria Eraser (best for removal)
      try {
        console.log("Remove Model 1: Bria Eraser...");
        resultUrl = await inpaintWithBriaEraser(imageUrl, maskUrl, FAL_KEY);
        console.log("✅ Bria Eraser başarılı!");
      } catch (err) {
        console.error("❌ Bria Eraser hatası:", err);
      }

      // Model 2: FLUX Fill with minimal prompt
      if (!resultUrl) {
        try {
          console.log("Remove Model 2: FLUX Fill Pro...");
          const removePrompt = "empty floor, empty wall, natural continuation of the exact same surrounding materials and textures, no new objects, no changes";
          resultUrl = await inpaintWithFluxFill(imageUrl, maskUrl, removePrompt, FAL_KEY);
          console.log("✅ FLUX Fill başarılı!");
        } catch (err) {
          console.error("❌ FLUX Fill hatası:", err);
        }
      }

      // Model 3: Nano Banana Pro with strict removal prompt
      if (!resultUrl) {
        try {
          console.log("Remove Model 3: Nano Banana Pro...");
          const removePrompt = "Remove the object in the masked area. Fill with the exact same floor/wall material visible around it. Do not add any new objects. Preserve all textures and patterns exactly.";
          resultUrl = await inpaintWithNanoBananaPro(imageUrl, maskUrl, removePrompt, FAL_KEY);
          console.log("✅ Nano Banana Pro başarılı!");
        } catch (err) {
          console.error("❌ Nano Banana Pro hatası:", err);
          throw new Error("Silme işlemi başarısız. Lütfen tekrar deneyin.");
        }
      }

    } else {
      // ========== REPLACE MODE ==========
      // User wants to put something specific in the masked area

      const replacePrompt = `${prompt.trim()}. CRITICAL: ONLY modify the masked white area. Every single pixel outside the mask must remain EXACTLY identical — same carpet pattern, same wall texture, same floor material, same furniture, same colors, same lighting. Seamlessly blend the new element with its surroundings. Match perspective, lighting direction, and shadows precisely. Photorealistic quality.`;

      // Model 1: Nano Banana Pro (best quality for replacement)
      try {
        console.log("Replace Model 1: Nano Banana Pro...");
        resultUrl = await inpaintWithNanoBananaPro(imageUrl, maskUrl, replacePrompt, FAL_KEY);
        console.log("✅ Nano Banana Pro başarılı!");
      } catch (err) {
        console.error("❌ Nano Banana Pro hatası:", err);
      }

      // Model 2: FLUX Fill Pro
      if (!resultUrl) {
        try {
          console.log("Replace Model 2: FLUX Fill Pro...");
          resultUrl = await inpaintWithFluxFill(imageUrl, maskUrl, replacePrompt, FAL_KEY);
          console.log("✅ FLUX Fill başarılı!");
        } catch (err) {
          console.error("❌ FLUX Fill hatası:", err);
        }
      }
    }

    if (!resultUrl) {
      throw new Error("Hiçbir model düzenleme yapamadı. Farklı bir alan seçmeyi veya fırçayı büyütmeyi deneyin.");
    }

    console.log("=== INPAINT TAMAMLANDI ===");
    return NextResponse.json({ success: true, resultImage: resultUrl });

  } catch (error) {
    console.error('Inpaint error:', error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Inpainting başarısız'
    }, { status: 500 });
  }
}

// Model: Nano Banana Pro Edit (uses edit endpoint with mask info in prompt)
async function inpaintWithNanoBananaPro(imageUrl: string, maskUrl: string, prompt: string, apiKey: string): Promise<string> {
  // Try inpaint endpoint first
  try {
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
    if (res.ok) {
      const data = await res.json();
      if (data.images?.[0]?.url) return data.images[0].url;
    }
    console.log("Inpaint endpoint failed, trying edit endpoint...");
  } catch {}

  // Fallback to edit endpoint
  const res = await fetch("https://fal.run/fal-ai/nano-banana-pro/edit", {
    method: "POST",
    headers: { "Authorization": `Key ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      prompt: `Using the mask, ${prompt}`,
      image_urls: [imageUrl, maskUrl],
      num_images: 1,
      output_format: "png",
    }),
  });
  if (!res.ok) {
    const errText = await res.text();
    console.error("Nano Banana Pro error response:", errText);
    throw new Error(`Nano Banana Pro: ${res.status}`);
  }
  const data = await res.json();
  if (data.images?.[0]?.url) return data.images[0].url;
  throw new Error("No images");
}

// Model: FLUX Fill Pro (v1)
async function inpaintWithFluxFill(imageUrl: string, maskUrl: string, prompt: string, apiKey: string): Promise<string> {
  const res = await fetch("https://fal.run/fal-ai/flux-pro/v1/fill", {
    method: "POST",
    headers: { "Authorization": `Key ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      prompt,
      image_url: imageUrl,
      mask_url: maskUrl,
    }),
  });
  if (!res.ok) {
    const errText = await res.text();
    console.error("FLUX Fill error response:", errText);
    throw new Error(`FLUX Fill: ${res.status}`);
  }
  const data = await res.json();
  if (data.images?.[0]?.url) return data.images[0].url;
  throw new Error("No images");
}

// Model: Bria Eraser (purpose-built for object removal)
async function inpaintWithBriaEraser(imageUrl: string, maskUrl: string, apiKey: string): Promise<string> {
  const res = await fetch("https://fal.run/fal-ai/bria/eraser", {
    method: "POST",
    headers: { "Authorization": `Key ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      image_url: imageUrl,
      mask_url: maskUrl,
      mask_type: "manual",
    }),
  });
  if (!res.ok) {
    const errText = await res.text();
    console.error("Bria Eraser error response:", errText);
    throw new Error(`Bria Eraser: ${res.status}`);
  }
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
