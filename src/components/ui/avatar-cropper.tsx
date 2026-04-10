import React, { useState, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

interface AvatarCropperProps {
    open: boolean;
    imageSrc: string;
    onClose: () => void;
    onCropComplete: (croppedBlob: Blob) => void;
}

export function AvatarCropper({ open, imageSrc, onClose, onCropComplete }: AvatarCropperProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [zoom, setZoom] = useState(1);
    const [offset, setOffset] = useState({ x: 0, y: 0 });
    const [isDragging, setIsDragging] = useState(false);
    const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
    const imageRef = useRef<HTMLImageElement | null>(null);

    React.useEffect(() => {
        if (imageSrc) {
            const img = new Image();
            img.onload = () => {
                imageRef.current = img;
                const initialZoom = 200 / Math.min(img.width, img.height);
                setZoom(Math.max(initialZoom, 1));
                draw();
            };
            img.src = imageSrc;
        }
    }, [imageSrc]);

    React.useEffect(() => {
        draw();
    }, [zoom, offset]);

    const draw = () => {
        const canvas = canvasRef.current;
        const img = imageRef.current;
        if (!canvas || !img) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        const w = img.width * zoom;
        const h = img.height * zoom;
        const x = (canvas.width - w) / 2 + offset.x;
        const y = (canvas.height - h) / 2 + offset.y;

        ctx.drawImage(img, x, y, w, h);
    };

    const handleMouseDown = (e: React.MouseEvent) => {
        setIsDragging(true);
        setDragStart({ x: e.clientX - offset.x, y: e.clientY - offset.y });
    };

    const handleMouseMove = (e: React.MouseEvent) => {
        if (!isDragging) return;
        setOffset({
            x: e.clientX - dragStart.x,
            y: e.clientY - dragStart.y,
        });
    };

    const handleMouseUp = () => {
        setIsDragging(false);
    };

    const handleSave = () => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        canvas.toBlob((blob) => {
            if (blob) {
                onCropComplete(blob);
            }
        }, 'image/jpeg', 0.9);
    };

    return (
        <Dialog open={open} onOpenChange={(val) => !val && onClose()}>
            <DialogContent className="sm:max-w-md bg-white text-black dark:bg-gray-800 dark:text-white">
                <DialogHeader>
                    <DialogTitle>Cắt ảnh đại diện</DialogTitle>
                </DialogHeader>
                <div className="flex flex-col items-center justify-center space-y-4">
                    <div 
                        className="relative w-[200px] h-[200px] overflow-hidden rounded-full border-2 border-dashed border-gray-300 cursor-move"
                        onMouseDown={handleMouseDown}
                        onMouseMove={handleMouseMove}
                        onMouseUp={handleMouseUp}
                        onMouseLeave={handleMouseUp}
                    >
                        <canvas
                            ref={canvasRef}
                            width={200}
                            height={200}
                            className="bg-black/5"
                        />
                    </div>
                    <div className="flex items-center space-x-2 w-full px-4">
                        <span className="text-sm">Zoom</span>
                        <input
                            type="range"
                            min="0.1"
                            max="5"
                            step="0.1"
                            value={zoom}
                            onChange={(e) => setZoom(parseFloat(e.target.value))}
                            className="w-full"
                        />
                    </div>
                    <p className="text-xs text-muted-foreground w-full text-center">
                        Kéo thả chuột bên trong hình tròn để căn chỉnh ảnh.
                    </p>
                </div>
                <DialogFooter className="sm:justify-end">
                    <Button type="button" variant="secondary" onClick={onClose}>
                        Hủy
                    </Button>
                    <Button type="button" onClick={handleSave}>
                        Lưu ảnh
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
