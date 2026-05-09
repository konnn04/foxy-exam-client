import re

with open('/home/konnn/Desktop/KLTN/code/exam-client/src/components/exam/camera-check.tsx', 'r') as f:
    code = f.read()

# Make sure we import requireDualCamera handling.
code = code.replace(
    'const canConfirmWebcam = selectedVideoId !== MOBILE_QR_DEVICE_ID && cameraReady;',
    '''
  const requireDualCamera = clientConfig?.requireDualCamera === true;
  const canConfirmWebcam = selectedVideoId !== MOBILE_QR_DEVICE_ID && cameraReady;
'''
)

code = code.replace(
    'const canConfirm = canConfirmWebcam || canConfirmMobile;',
    '''const canConfirm = requireDualCamera ? (canConfirmWebcam && relayPreviewStream !== null) : (canConfirmWebcam || canConfirmMobile);'''
)

# Remove MOBILE_QR_DEVICE_ID from the select options if requireDualCamera is true
code = code.replace(
    '{onMobileRelayReady && (',
    '{onMobileRelayReady && !requireDualCamera && ('
)

# Render the QR flow outside the Select for Dual Camera mode
qr_flow_ui = '''
                  {requireDualCamera && onMobileRelayReady && (
                    <div className="mt-4 rounded-md border border-border bg-muted/30 p-2 space-y-2">
                      <p className="text-sm font-semibold text-primary flex items-center gap-2"><Smartphone className="w-4 h-4"/> Bắt buộc: Camera phụ (Điện thoại)</p>
                      {qrLoading && <p className="text-[11px] text-muted-foreground">Đang tạo mã QR...</p>}
                      {!qrUrl && !qrLoading && (
                         <Button type="button" variant="secondary" size="sm" className="h-7 text-xs w-full" onClick={() => void issueQrAndPoll()}>Tạo mã QR kết nối Camera phụ</Button>
                      )}
                      {qrUrl && (
                        <div className="flex gap-2 items-start">
                          <div className="shrink-0 rounded bg-white p-1">
                            <QRCodeSVG value={qrUrl} size={104} level="M" />
                          </div>
                          <div className="min-w-0 flex-1 space-y-1">
                            <p className="text-[10px] text-muted-foreground leading-snug">
                              Quét mã bằng điện thoại, chọn cho phép Camera và bấm «Bắt đầu».
                            </p>
                            {(pollingRelay || qrBinding) && !relayPreviewStream && (
                              <p className="text-[10px] text-primary animate-pulse">
                                {qrBinding ? "Đang kết nối..." : "Đang chờ điện thoại..."}
                              </p>
                            )}
                            {relayPreviewStream && (
                              <p className="text-[10px] text-green-500 font-bold">
                                ✓ Đã kết nối thành công Camera phụ.
                              </p>
                            )}
                          </div>
                        </div>
                      )}
                      {qrError && (
                        <div className="space-y-1">
                          <p className="text-[11px] text-destructive">{qrError}</p>
                          <Button type="button" variant="secondary" size="sm" className="h-7 text-xs" onClick={() => void issueQrAndPoll()}>Thử tạo mã lại</Button>
                        </div>
                      )}
                    </div>
                  )}
'''
code = code.replace(
    '{selectedVideoId === MOBILE_QR_DEVICE_ID && onMobileRelayReady && (',
    qr_flow_ui + '\n                  {selectedVideoId === MOBILE_QR_DEVICE_ID && onMobileRelayReady && !requireDualCamera && ('
)

# Handle Confirm
code = code.replace(
    '''if (selectedVideoId === MOBILE_QR_DEVICE_ID && relayPreviewStream && onMobileRelayReady) {
      onMobileRelayReady(relayPreviewStream);
      return;
    }''',
    '''if (requireDualCamera && relayPreviewStream && onMobileRelayReady) {
      // In dual camera mode, pass the relay stream via callback, but also continue to onConfirm for the main webcam
      onMobileRelayReady(relayPreviewStream);
      if (stream) onConfirm(stream);
      return;
    }
    if (selectedVideoId === MOBILE_QR_DEVICE_ID && relayPreviewStream && onMobileRelayReady) {
      onMobileRelayReady(relayPreviewStream);
      return;
    }'''
)

# Display dual streams in video element if requireDualCamera
# Wait, videoRef only displays one stream. We can add a small PIP (Picture-In-Picture) video for the mobile cam.
pip_video_ui = '''
            {requireDualCamera && relayPreviewStream && (
               <div className="absolute bottom-4 right-4 w-32 aspect-video rounded-lg border-2 border-green-500 overflow-hidden shadow-2xl z-20 bg-black">
                 <video autoPlay playsInline muted srcObject={relayPreviewStream} className="w-full h-full object-cover" style={{ transform: "scaleX(-1)" }} />
               </div>
            )}
'''
code = code.replace(
    'style={{ transform: "scaleX(-1)", zIndex: 1 }}',
    'style={{ transform: "scaleX(-1)", zIndex: 1 }}\n            />' + pip_video_ui
)
code = code.replace('/>\n            />', '/>')

with open('/home/konnn/Desktop/KLTN/code/exam-client/src/components/exam/camera-check.tsx', 'w') as f:
    f.write(code)
print("Patched!")
