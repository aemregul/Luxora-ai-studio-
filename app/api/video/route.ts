import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const { startImage, endImage, prompt, duration, action, requestId, statusUrl, responseUrl } = await request.json();

    const FAL_KEY = process.env.FAL_KEY;
    if (!FAL_KEY) {
      return NextResponse.json({ error: 'FAL API anahtarı yapılandırılmamış' }, { status: 500 });
    }

    // === POLL MODE: Check status of existing request ===
    if (action === 'poll' && requestId && statusUrl) {
      try {
        const statusRes = await fetch(statusUrl, {
          headers: { "Authorization": `Key ${FAL_KEY}` },
        });

        if (!statusRes.ok) {
          console.log("Poll status not ok:", statusRes.status);
          return NextResponse.json({ status: 'processing', message: 'Kuyrukta...' });
        }

        const statusData = await statusRes.json();
        console.log("Poll status:", statusData.status, "position:", statusData.queue_position);

        if (statusData.status === "COMPLETED") {
          // Fetch result using response_url
          const resultRes = await fetch(responseUrl, {
            headers: { "Authorization": `Key ${FAL_KEY}` },
          });

          if (!resultRes.ok) return NextResponse.json({ status: 'error', error: 'Sonuç alınamadı' });
          const resultData = await resultRes.json();

          if (resultData.video?.url) {
            return NextResponse.json({ status: 'completed', videoUrl: resultData.video.url });
          }
          return NextResponse.json({ status: 'error', error: 'Video URL bulunamadı' });
        }

        if (statusData.status === "FAILED") {
          return NextResponse.json({ status: 'error', error: 'Video üretimi başarısız' });
        }

        // IN_QUEUE or IN_PROGRESS
        return NextResponse.json({ 
          status: 'processing', 
          queueStatus: statusData.status,
          position: statusData.queue_position,
        });
      } catch (pollErr) {
        console.error("Poll error:", pollErr);
        return NextResponse.json({ status: 'processing', message: 'Tekrar deneniyor...' });
      }
    }

    // === SUBMIT MODE: Start new video generation ===
    if (!startImage) {
      return NextResponse.json({ error: 'Başlangıç görseli gereklidir' }, { status: 400 });
    }

    console.log("=== LUXORA VIDEO SUBMIT ===");
    console.log("Duration:", duration || 5);
    console.log("Has end frame:", !!endImage);

    // Upload images to CDN
    let startUrl = startImage;
    let endUrl = endImage || null;

    if (startImage.startsWith('data:')) {
      startUrl = await uploadToFalCDN(startImage, FAL_KEY);
    }
    if (endImage && endImage.startsWith('data:')) {
      endUrl = await uploadToFalCDN(endImage, FAL_KEY);
    }

    const videoPrompt = prompt && prompt.trim()
      ? prompt.trim()
      : "Slow cinematic camera movement through an elegant interior space, smooth dolly shot, gentle panning, professional architectural videography, ambient lighting";

    const body: Record<string, unknown> = {
      prompt: videoPrompt,
      image_url: startUrl,
      duration: String(duration || 5),
      resolution: "480p",
      aspect_ratio: "16:9",
      generate_audio: false,
    };

    if (endUrl) {
      body.end_image_url = endUrl;
    }

    // Submit to queue — use the fast endpoint
    const submitUrl = "https://queue.fal.run/bytedance/seedance-2.0/fast/image-to-video";
    console.log("Submit URL:", submitUrl);

    const submitRes = await fetch(submitUrl, {
      method: "POST",
      headers: { "Authorization": `Key ${FAL_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!submitRes.ok) {
      const errText = await submitRes.text();
      console.error("Seedance submit error:", errText);
      throw new Error(`Video kuyruğa eklenemedi: ${submitRes.status}`);
    }

    const submitData = await submitRes.json();
    console.log("✅ Submit response:", JSON.stringify(submitData));

    // Return the ACTUAL URLs from the API response (they differ from submit URL!)
    return NextResponse.json({ 
      success: true, 
      requestId: submitData.request_id,
      statusUrl: submitData.status_url,
      responseUrl: submitData.response_url,
      status: 'submitted',
    });

  } catch (error) {
    console.error('Video error:', error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Video üretilemedi'
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
    body: JSON.stringify({ file_name: `video_${Date.now()}.${ext}`, content_type: mimeType }),
  });
  if (!initRes.ok) return base64Data;
  const { upload_url, file_url } = await initRes.json();
  const uploadRes = await fetch(upload_url, { method: "PUT", headers: { "Content-Type": mimeType }, body: bytes });
  return uploadRes.ok ? file_url : base64Data;
}
