'use client';

import { useEffect, useRef, useState } from 'react';
import { Camera, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';

// Camera-based IMEI scanner.
//
// Uses the browser's BarcodeDetector API (built into Chrome / Edge on Android
// and desktop) to read Code-128 / ITF barcodes — the two formats printed on
// phone boxes for the IMEI. When a barcode is detected we call `onScan(imei)`,
// close the camera, and release the video stream so the indicator light
// turns off.
//
// Browsers without BarcodeDetector (older Safari / Firefox) show a clear
// "not supported here" toast and fall back to manual entry. We don't pull
// in a heavy fallback library since Chrome on Android covers ~all real use.
interface Props {
  onScan: (imei: string) => void;
  className?: string;
}

export function ImeiScanner({ onScan, className }: Props) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<'idle' | 'starting' | 'scanning' | 'denied' | 'unsupported'>('idle');
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const detectorRef = useRef<any>(null);
  const tickRef = useRef<number | null>(null);

  function stopCamera() {
    if (tickRef.current) {
      window.clearInterval(tickRef.current);
      tickRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) videoRef.current.srcObject = null;
  }

  useEffect(() => {
    if (!open) {
      stopCamera();
      setStatus('idle');
      return;
    }

    let cancelled = false;

    (async () => {
      const win = window as any;
      if (typeof win.BarcodeDetector !== 'function') {
        setStatus('unsupported');
        return;
      }
      setStatus('starting');
      try {
        const formats = await win.BarcodeDetector.getSupportedFormats();
        const wantFormats = ['code_128', 'itf', 'ean_13'].filter((f) => formats.includes(f));
        detectorRef.current = new win.BarcodeDetector({ formats: wantFormats });

        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' }, // rear camera
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        await video.play().catch(() => {});
        setStatus('scanning');

        tickRef.current = window.setInterval(async () => {
          if (!videoRef.current || !detectorRef.current) return;
          try {
            const codes = await detectorRef.current.detect(videoRef.current);
            const raw = codes?.[0]?.rawValue;
            if (raw) {
              const cleaned = String(raw).replace(/\D/g, '');
              // IMEI numbers are 14 or 15 digits. Anything in that range is good.
              if (cleaned.length >= 14 && cleaned.length <= 17) {
                onScan(cleaned.slice(0, 15));
                setOpen(false);
              }
            }
          } catch {
            // single frame failed — ignore, next tick will try
          }
        }, 200);
      } catch (e: any) {
        if (e?.name === 'NotAllowedError' || e?.name === 'PermissionDeniedError') {
          setStatus('denied');
        } else {
          setStatus('unsupported');
          toast({ variant: 'destructive', title: 'שגיאה במצלמה', description: e?.message ?? 'לא ניתן לפתוח את המצלמה' });
        }
      }
    })();

    return () => {
      cancelled = true;
      stopCamera();
    };
  }, [open, onScan, toast]);

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="icon"
        className={className}
        onClick={() => setOpen(true)}
        title="סרוק IMEI מהקופסה"
      >
        <Camera className="h-4 w-4" />
      </Button>

      {open && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex flex-col items-center justify-center p-4"
          onClick={() => setOpen(false)}
        >
          <div className="relative w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className="absolute -top-3 -left-3 z-10 bg-white rounded-full p-2 shadow-lg"
              onClick={() => setOpen(false)}
            >
              <X className="h-5 w-5" />
            </button>

            <div className="bg-black rounded-lg overflow-hidden aspect-[4/3] relative">
              <video
                ref={videoRef}
                className="w-full h-full object-cover"
                playsInline
                muted
              />
              {/* Scan-area overlay */}
              <div className="absolute inset-x-8 top-1/2 -translate-y-1/2 h-20 border-2 border-white/80 rounded-md pointer-events-none">
                <div className="absolute left-0 right-0 top-1/2 h-0.5 bg-green-400 animate-pulse" />
              </div>
            </div>

            <div className="mt-3 text-center text-white text-sm">
              {status === 'starting' && 'מפעיל מצלמה...'}
              {status === 'scanning' && 'כוון לברקוד ה-IMEI על הקופסה / מכשיר'}
              {status === 'denied' && 'הרשאת מצלמה נדחתה — אפשר בהגדרות הדפדפן ונסה שוב'}
              {status === 'unsupported' && 'הדפדפן הזה לא תומך בסריקת ברקוד — הקלד ידנית'}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
