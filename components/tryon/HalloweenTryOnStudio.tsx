'use client';

import { Button } from '@/components/ui/button';
import { useCart } from '@/context/CartContext';
import { HalloweenProduct } from '@/lib/halloweenCatalog';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { Sparkles, Wand2, X } from 'lucide-react';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';

function CostumeAvatar({ product }: { product: HalloweenProduct }) {
  const headColor = '#f7d9c5';
  const accent = product.accent;
  const base = product.palette[0];
  const trim = product.palette[1];
  const glow = product.palette[2];
  const horns = product.theme === 'Vampire' || product.theme === 'Classic';
  const hat = product.theme === 'Witch' || product.theme === 'Classic';
  const cape = product.theme === 'Vampire' || product.theme === 'Masquerade' || product.theme === 'Hero';

  const accessoryRotation = useMemo(() => new THREE.Euler(0, 0.8, 0), []);
  const groupRef = useRef<THREE.Group>(null);

  return (
    <group ref={groupRef} rotation={accessoryRotation} position={[0, -0.9, 0]}>
      <mesh position={[0, 2.2, 0]} castShadow>
        <sphereGeometry args={[0.52, 32, 32]} />
        <meshStandardMaterial color={headColor} roughness={0.8} />
      </mesh>

      {product.theme === 'Space' && (
        <mesh position={[0, 2.2, 0.08]}>
          <boxGeometry args={[0.75, 0.18, 0.12]} />
          <meshStandardMaterial color={trim} emissive={trim} emissiveIntensity={0.6} />
        </mesh>
      )}

      {product.theme === 'Masquerade' && (
        <mesh position={[0, 2.45, 0.08]} rotation={[0.2, 0, 0]}>
          <boxGeometry args={[0.9, 0.18, 0.22]} />
          <meshStandardMaterial color={trim} metalness={0.6} roughness={0.2} />
        </mesh>
      )}

      {horns && (
        <>
          <mesh position={[-0.28, 2.8, 0]} rotation={[0, 0, -0.5]}>
            <coneGeometry args={[0.11, 0.55, 18]} />
            <meshStandardMaterial color={trim} metalness={0.4} roughness={0.3} />
          </mesh>
          <mesh position={[0.28, 2.8, 0]} rotation={[0, 0, 0.5]}>
            <coneGeometry args={[0.11, 0.55, 18]} />
            <meshStandardMaterial color={trim} metalness={0.4} roughness={0.3} />
          </mesh>
        </>
      )}

      {hat && (
        <>
          <mesh position={[0, 3.05, 0]} rotation={[0, 0, 0.04]}>
            <coneGeometry args={[0.58, 0.7, 32]} />
            <meshStandardMaterial color={base} roughness={0.7} />
          </mesh>
          <mesh position={[0, 3.35, 0]}>
            <cylinderGeometry args={[0.28, 0.32, 0.2, 24]} />
            <meshStandardMaterial color={trim} metalness={0.5} roughness={0.3} />
          </mesh>
        </>
      )}

      <mesh position={[0, 0.9, 0]} castShadow>
        <capsuleGeometry args={[0.7, 1.6, 8, 24]} />
        <meshStandardMaterial color={base} roughness={0.75} metalness={0.3} />
      </mesh>

      {cape && (
        <mesh position={[0, 0.7, -0.52]} rotation={[0.15, 0, 0]} castShadow>
          <boxGeometry args={[1.4, 2.1, 0.2]} />
          <meshStandardMaterial color={trim} roughness={0.85} />
        </mesh>
      )}

      <mesh position={[0, 0.15, 0]} castShadow>
        <cylinderGeometry args={[0.58, 0.7, 0.35, 32]} />
        <meshStandardMaterial color={trim} emissive={accent} emissiveIntensity={0.12} />
      </mesh>

      <mesh position={[-0.58, 0.9, 0.05]} rotation={[0, 0, -0.35]}>
        <capsuleGeometry args={[0.14, 1.1, 8, 18]} />
        <meshStandardMaterial color={base} roughness={0.8} />
      </mesh>
      <mesh position={[0.58, 0.9, 0.05]} rotation={[0, 0, 0.35]}>
        <capsuleGeometry args={[0.14, 1.1, 8, 18]} />
        <meshStandardMaterial color={base} roughness={0.8} />
      </mesh>

      <mesh position={[-0.2, -0.9, 0]} rotation={[0, 0, 0.06]}>
        <capsuleGeometry args={[0.18, 1.3, 8, 18]} />
        <meshStandardMaterial color={trim} roughness={0.75} />
      </mesh>
      <mesh position={[0.2, -0.9, 0]} rotation={[0, 0, -0.06]}>
        <capsuleGeometry args={[0.18, 1.3, 8, 18]} />
        <meshStandardMaterial color={trim} roughness={0.75} />
      </mesh>

      <mesh position={[0.12, -0.1, 0.12]} rotation={[0.35, 0, 0]}>
        <boxGeometry args={[0.22, 0.08, 0.5]} />
        <meshStandardMaterial color={glow} emissive={glow} emissiveIntensity={0.45} />
      </mesh>
    </group>
  );
}

export function HalloweenTryOnStudio({ product, onClose }: { product: HalloweenProduct; onClose: () => void }) {
  const { addToCart } = useCart();

  return (
    <div className="fixed inset-0 z-[100] bg-slate-950/75 backdrop-blur-sm flex items-center justify-center p-4 sm:p-8">
      <div className="relative w-full max-w-6xl overflow-hidden rounded-[2rem] border border-white/10 bg-slate-950 shadow-2xl">
        <div className="absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-white/10 to-transparent" />

        <div className="flex items-center justify-between border-b border-white/10 px-5 py-4 sm:px-8">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.28em] text-violet-300">3D try-on studio</p>
            <h2 className="mt-2 text-2xl font-black uppercase tracking-tighter text-white">{product.name}</h2>
          </div>
          <button
            onClick={onClose}
            className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white transition hover:bg-white/10"
            aria-label="Close try-on studio"
          >
            <X size={18} />
          </button>
        </div>

        <div className="grid gap-6 p-4 sm:p-6 lg:grid-cols-[1.35fr_0.65fr]">
          <div className="overflow-hidden rounded-[1.6rem] border border-violet-500/20 bg-gradient-to-br from-slate-900 via-slate-950 to-violet-950">
            <div className="flex items-center justify-between border-b border-white/5 px-4 py-3 text-[9px] font-black uppercase tracking-[0.28em] text-slate-300">
              <span>Live preview</span>
              <span className="flex items-center gap-2 text-violet-200">
                <Sparkles size={12} /> Style-fit perfect
              </span>
            </div>
            <div className="h-[420px] w-full">
              <Canvas camera={{ position: [0, 1.5, 6], fov: 32 }} shadows>
                <color attach="background" args={['#020617']} />
                <ambientLight intensity={1.3} />
                <directionalLight position={[3, 6, 3]} intensity={1.8} castShadow />
                <directionalLight position={[-3, 4, -2]} intensity={1.2} />
                <pointLight position={[0, 3, 4]} intensity={1.5} color={product.accent} />
                <CostumeAvatar product={product} />
                <OrbitControls enablePan={false} enableZoom={true} minDistance={4} maxDistance={8} minPolarAngle={0.8} maxPolarAngle={2.2} />
              </Canvas>
            </div>
          </div>

          <div className="flex flex-col gap-4 rounded-[1.6rem] border border-white/10 bg-white/5 p-4 sm:p-5">
            <div className="flex items-center gap-2 text-[9px] font-black uppercase tracking-[0.28em] text-amber-300">
              <Wand2 size={12} /> {product.tryOnLabel}
            </div>

            <div>
              <p className="text-sm text-slate-300">Estimated fit score</p>
              <div className="mt-2 flex items-end gap-3">
                <span className="text-4xl font-black tracking-tighter text-white">94%</span>
                <span className="mb-1 rounded-full border border-emerald-400/30 bg-emerald-500/10 px-2 py-1 text-[9px] font-black uppercase tracking-[0.2em] text-emerald-300">Fits your build</span>
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-4">
              <p className="text-[10px] font-black uppercase tracking-[0.28em] text-slate-400">Style notes</p>
              <ul className="mt-3 space-y-2 text-sm text-slate-200">
                <li>• Comfortable layered shape with easy movement</li>
                <li>• Best match for {product.fitNote.toLowerCase()}</li>
                <li>• Works for warm indoor parties and outdoor photo spots</li>
              </ul>
            </div>

            <div className="grid grid-cols-3 gap-2 text-center">
              {product.sizes.slice(0, 3).map(size => (
                <div key={size} className="rounded-xl border border-white/10 bg-slate-900/70 px-3 py-2 text-sm font-bold text-white">
                  {size}
                </div>
              ))}
            </div>

            <div className="mt-auto space-y-3 pt-3">
              <Button
                className="w-full rounded-2xl bg-violet-500 hover:bg-violet-400 text-white font-black uppercase tracking-widest text-[10px]"
                onClick={() => {
                  addToCart({
                    id: product.id,
                    name: product.name,
                    price: product.price,
                    base_price: product.price,
                    image: '',
                    quantity: 1,
                    category: product.category,
                    size: product.sizes[0]
                  });
                  onClose();
                }}
              >
                Add to cart
              </Button>
              <Button
                variant="outline"
                className="w-full rounded-2xl border-white/10 bg-white/5 text-white hover:bg-white/10 font-black uppercase tracking-widest text-[10px]"
                onClick={onClose}
              >
                Keep browsing
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
