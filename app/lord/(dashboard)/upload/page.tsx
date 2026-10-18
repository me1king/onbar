'use client';

import { useMemo, useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Image from 'next/image';
import TacticalEventFeed from '@/components/admin/TacticalEventFeed';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { supabase } from '@/lib/supabaseClient';
import {
    RefreshCcw,
    ChevronDown,
    ChevronUp,
    ChevronRight,
    TrendingUp as ProfitIcon,
    Wine,
    Info,
    Search,
    ImageIcon,
    Layers,
    Loader2,
    Download,
    X,
    Trash2,
    Camera,
    Eye,
    Zap,
    Plus,
    Bot,
    Scan
} from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { cn, formatPrice, normalizeImage } from '@/lib/utils';
import { useAdmin } from '@/context/AdminContext';
import { useSettings } from '@/lib/useSettings';
import { logAuditAction } from '@/lib/auditService';
import { auditImageQuality, standardizeImageCanvas, type ImageAuditResult } from '@/lib/engines/imageEngine';

const initialForm = {
  name: '',
  brand: '',
  category: 'wine',
  sub_category: '',
  sku: '',
  model_number: '',
  price: '',
  cost_price: '',
  old_price: '',
  description: '',
  short_description: '',
  what_is_in_the_box: '',
  sizes: 'Standard',
  stock: '',
  low_stock_alert: '5',
  warehouse_location: '',
  sale_end_date: '',
  featured_rank: '99',
  is_featured: false,
  is_snack: false,
  is_on_offer: false,
  is_best_seller: false,
  allow_backorders: false,
  hide_product: false,
  min_loyalty_tier: 'Explorer',
  is_dynamic_pricing: false,
  price_min: '',
  price_max: '',
  wholesale_price: '',
  wholesale_min_qty: '10',
  wholesale_stock_reserve: '0',
  seo_title: '',
  seo_description: '',
  seo_keywords: '',
  weight_kg: '',
  length_cm: '',
  width_cm: '',
  height_cm: '',
  abv_label: '40% ABV',
  origin: 'Imported',
  region: 'Highlands',
  body: 'Medium',
  sweetness: 'Off-dry',
  size_label: '750ml',
  manufacturer: '',
  glassware: 'Highball Glass',
  sensory_metrics_body: '60',
  sensory_metrics_sweet: '60',
  sensory_metrics_smoke: '20',
  sensory_metrics_spice: '40',
  pairing_suggestions: '',
  bought_together_ids: ''
};

interface Product {
  id: number;
  name: string;
  brand?: string;
  origin?: string;
  region?: string;
  body?: string;
  sweetness?: string;
  abv_label?: string;
  size_label?: string;
  manufacturer?: string;
  sku?: string;
  model_number?: string;
  price: number;
  cost_price: number;
  old_price?: number;
  description: string;
  short_description?: string;
  what_is_in_the_box?: string;
  image_url: string;
  video_url?: string;
  images: string[];
  sizes: string[];
  stock: number;
  low_stock_alert?: number;
  warehouse_location?: string;
  category: string;
  sub_category?: string;
  variant_prices?: Record<string, number>;
  sale_end_date?: string;
  featured_rank?: number;
  is_featured?: boolean;
  is_snack?: boolean;
  is_on_offer?: boolean;
  is_best_seller?: boolean;
  allow_backorders?: boolean;
  hide_product?: boolean;
  seo_title?: string;
  seo_description?: string;
  seo_keywords?: string[];
  weight_kg?: number;
  length_cm?: number;
  width_cm?: number;
  height_cm?: number;
  variant_stock?: Record<string, number>;
  beverage_specs?: Record<string, string>;
  sensory_metrics?: Record<string, number>;
  pairing_suggestions?: string[];
  bought_together_ids?: number[];
  status?: string;
  supplier_id?: number;
  min_loyalty_tier?: string;
  is_dynamic_pricing?: boolean;
  price_min?: number;
  price_max?: number;
  wholesale_price?: number;
  wholesale_min_qty?: number;
  wholesale_stock_reserve?: number;
}

interface Hub {
    id: string;
    name: string;
}

export default function AdminUploadPage() {
    return (
        <Suspense fallback={<div className="p-24 text-center animate-pulse font-black text-slate-400 uppercase">Establishing Stock Sync...</div>}>
            <UploadContent />
        </Suspense>
    );
}

function UploadContent() {
  const { role, email, permissions } = useAdmin();
  const { settings } = useSettings();
  const searchParams = useSearchParams();
  const categoryScope = searchParams.get('category')?.trim().toLowerCase() || '';
  const isExtrasPage = categoryScope === 'extras';
  const scopedInitialForm = { ...initialForm, category: categoryScope || initialForm.category };
  const [form, setForm] = useState(scopedInitialForm);
  const [variantStock, setVariantStock] = useState<Record<string, string>>({});
  const [variantPrices, setVariantPrices] = useState<Record<string, string>>({});
  const [beverageSpecs, setBeverageSpecs] = useState<{ key: string, value: string }[]>([]);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [selectedImagePreviews, setSelectedImagePreviews] = useState<string[]>([]);
  const [existingImages, setExistingImages] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [hubs, setHubs] = useState<Hub[]>([]);
  const [hubStock, setHubStock] = useState<Record<string, string>>({});
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formSession, setFormSession] = useState(0);
  const [isGenerating, setIsGenerating] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isVisionScanning, setIsVisionScanning] = useState(false);
  const [imageAudits, setImageAudits] = useState<Record<string, ImageAuditResult>>({});
  const visibleProducts = useMemo(
      () => categoryScope
          ? products.filter(product => product.category.toLowerCase().includes(categoryScope))
          : products,
      [categoryScope, products]
  );
  const categoryOptions = settings.catalog.categories.some(category => category.id.toLowerCase() === 'extras')
      ? settings.catalog.categories
      : [...settings.catalog.categories, { id: 'extras', label: 'Extras' }];

  // Section States
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
      basic: true,
      beverageSpecs: true,
      pricing: true,
      inventory: true,
      description: true,
      media: true,
      shipping: false,
      seo: false,
      status: true
  });

  const toggleSection = (id: string) => {
      setOpenSections(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.target;
    if (!input.files) return;

    const files = Array.from(input.files);
    input.value = '';
    const availableSlots = Math.max(0, 4 - existingImages.length - selectedFiles.length);
    if (availableSlots === 0) {
        setMessage({ type: 'error', text: 'A product can have up to four images total.' });
        return;
    }
    if (files.length > availableSlots) {
        setMessage({ type: 'error', text: `Only ${availableSlots} more image${availableSlots === 1 ? '' : 's'} can be added (4 total maximum).` });
    }

    const acceptedFiles = files.slice(0, availableSlots);
    const processedFiles: File[] = [];
    const audits: Record<string, ImageAuditResult> = {};

    for (const file of acceptedFiles) {
        const audit = await auditImageQuality(file);
        audits[file.name] = audit;
        if (audit.isApproved) {
            const normalizedBlob = await standardizeImageCanvas(file);
            processedFiles.push(new File([normalizedBlob], file.name, { type: 'image/webp' }));
        } else {
            processedFiles.push(file);
        }
    }

    setImageAudits(prev => ({ ...prev, ...audits }));
    setSelectedFiles(prev => [...prev, ...processedFiles]);
    setSelectedImagePreviews(prev => [...prev, ...processedFiles.map(file => URL.createObjectURL(file))]);
  };

  const removeExistingImage = (index: number) => {
    setExistingImages(prev => prev.filter((_, i) => i !== index));
  };

  const removeSelectedImage = (index: number) => {
    const previewUrl = selectedImagePreviews[index];
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
    setSelectedImagePreviews(prev => prev.filter((_, i) => i !== index));
  };

  const canManageInventory = role === 'admin' || role === 'owner' || permissions.can_manage_inventory;

  useEffect(() => {
    if (!editingId) setForm(prev => ({ ...prev, category: categoryScope || initialForm.category }));
  }, [categoryScope, editingId]);

  const fetchProducts = async () => {
    if (!supabase) return;
    try {
      const [prodRes, hubRes] = await Promise.all([
        supabase.from('products').select('*').order('id', { ascending: false }),
        supabase.from('hubs').select('id, name').eq('is_active', true)
      ]);

      if (prodRes.error) {
          if (prodRes.error.message.includes('column')) {
              setMessage({ type: 'error', text: "Database Schema Outdated. Run the updated FINAL_ESTABLISHMENT_SQL.sql script." });
          }
          throw prodRes.error;
      }
      setProducts(prodRes.data || []);
      setHubs(hubRes.data || []);
    } catch {
      // Handled in message state
    }
  };

  useEffect(() => {
    if (supabase) {
      fetchProducts();
    }

    (window as Window & { onTitanScan?: (sku: string) => void }).onTitanScan = (sku: string) => {
        setForm(prev => ({ ...prev, sku: sku }));
        setMessage({ type: 'success', text: `Node Synced: ${sku}` });
        setTimeout(() => setMessage(null), 3000);
    };

    (window as Window & { onTitanTriage?: (result: string) => void }).onTitanTriage = (result: string) => {
        setMessage({ type: 'success', text: `AI Triage Signal: ${result}` });
        // Optionally parse result to update description or category
        if (result.toLowerCase().includes('wine')) setForm(prev => ({ ...prev, category: 'wine' }));
        setTimeout(() => setMessage(null), 5000);
    };

    return () => {
        delete (window as Window & { onTitanScan?: (sku: string) => void }).onTitanScan;
        delete (window as Window & { onTitanTriage?: (result: string) => void }).onTitanTriage;
    };
  }, []);

  const triggerBarScanner = () => {
    const win = window as Window & { TitanNode?: { triggerScanner: () => void } };
    if (win.TitanNode?.triggerScanner) {
        win.TitanNode.triggerScanner();
    } else {
        alert("Native Scanner Node not detected. Use the Online Bar Mobile App.");
    }
  };

  const currentVariants = useMemo(() => {
    return (form?.sizes || '').split(',').map(s => s.trim()).filter(s => s);
  }, [form.sizes]);

  const profitIntel = useMemo(() => {
      const sell = Number(form.price) || 0;
      const cost = Number(form.cost_price) || 0;
      const profit = sell - cost;
      const margin = sell > 0 ? (profit / sell) * 100 : 0;
      return { profit, margin };
  }, [form.price, form.cost_price]);

  const stockIntelligence = useMemo(() => {
      if (!editingId) return null;
      const currentStock = Number(form.stock) || 0;
      const avgDailySales = 1.2;
      const daysRemaining = avgDailySales > 0 ? (currentStock / avgDailySales).toFixed(1) : '∞';
      const reorderPoint = 8;
      const isReorderUrgent = currentStock <= reorderPoint;
      return { currentStock, avgDailySales, daysRemaining, reorderPoint, isReorderUrgent };
  }, [editingId, form.stock]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const target = e.target;
    const { name, value, type } = target;
    const val = type === 'checkbox' ? (target as HTMLInputElement).checked : value;
    setForm(prev => ({ ...prev, [name]: val }));
  };

  const handleVariantStockChange = (variant: string, value: string) => {
    setVariantStock(prev => ({ ...prev, [variant]: value }));
  };

  const handleVariantPriceChange = (variant: string, value: string) => {
    setVariantPrices(prev => ({ ...prev, [variant]: value }));
  };

  const handleAddSpec = () => setBeverageSpecs([...beverageSpecs, { key: '', value: '' }]);
  const handleSpecChange = (index: number, field: 'key' | 'value', value: string) => {
      const newSpecs = [...beverageSpecs];
      newSpecs[index][field] = value;
      setBeverageSpecs(newSpecs);
  };
  const handleRemoveSpec = (index: number) => setBeverageSpecs(beverageSpecs.filter((_, i) => i !== index));

  const handleGenerateDescription = async () => {
    if (!form.name.trim()) return;
    setIsGenerating(true);
    try {
        const res = await fetch('/api/admin/generate-description', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: form.name, category: form.category }),
        });
        const data = await res.json();
        if (data.description) setForm(prev => ({ ...prev, description: data.description }));
    } catch (err: unknown) {
        console.error("Content generation failed", err);
    } finally {
        setIsGenerating(false);
    }
  };

  const handleVisionScan = async () => {
    if (selectedFiles.length === 0) return;
    setIsVisionScanning(true);
    try {
        setMessage({ type: 'error', text: "Vision API Node not connected." });
    } finally {
        setIsVisionScanning(false);
    }
  };

  const startEditing = (product: Product) => {
    const vStock: Record<string, string> = {};
    if (product.variant_stock) Object.entries(product.variant_stock).forEach(([k, v]) => vStock[k] = v.toString());
    const vPrices: Record<string, string> = {};
    if (product.variant_prices) Object.entries(product.variant_prices).forEach(([k, v]) => vPrices[k] = String(v));

    setForm({
      ...initialForm,
      name: product.name || '',
      brand: product.brand || '',
      origin: product.origin || product.beverage_specs?.origin || 'Imported',
      region: product.region || product.beverage_specs?.region || 'Highlands',
      body: product.body || product.beverage_specs?.body || 'Medium',
      sweetness: product.sweetness || product.beverage_specs?.sweetness || 'Off-dry',
      abv_label: product.abv_label || product.beverage_specs?.abv || '40% ABV',
      size_label: product.size_label || (Array.isArray(product.sizes) ? product.sizes[0] : '750ml'),
      manufacturer: product.manufacturer || '',
      glassware: product.beverage_specs?.glassware || 'Highball Glass',
      category: product.category || 'wine',
      sub_category: product.sub_category || '',
      sku: product.sku || '',
      price: String(product.price ?? ''),
      cost_price: String(product.cost_price ?? ''),
      old_price: String(product.old_price ?? ''),
      description: product.description || '',
      sizes: Array.isArray(product.sizes) ? product.sizes.join(',') : '750ml',
      stock: String(product.stock ?? '0'),
      is_featured: product.is_featured || false,
      is_snack: product.is_snack || false,
      is_on_offer: product.is_on_offer || (product.old_price ? Number(product.old_price) > Number(product.price) : false),
      hide_product: product.hide_product || false,
      sensory_metrics_body: String(product.sensory_metrics?.body ?? '60'),
      sensory_metrics_sweet: String(product.sensory_metrics?.sweet ?? '60'),
      sensory_metrics_smoke: String(product.sensory_metrics?.smoke ?? '20'),
      sensory_metrics_spice: String(product.sensory_metrics?.spice ?? '40'),
      pairing_suggestions: Array.isArray(product.pairing_suggestions) ? product.pairing_suggestions.join(', ') : '',
      bought_together_ids: Array.isArray(product.bought_together_ids) ? product.bought_together_ids.join(', ') : ''
    });

    setExistingImages(product.images || [product.image_url]);
    setVariantStock(vStock);
    setVariantPrices(vPrices);
    setBeverageSpecs(product.beverage_specs ? Object.entries(product.beverage_specs).map(([key, value]) => ({ key, value })) : []);
    setEditingId(product.id);
    setFormSession(prev => prev + 1);

    async function fetchHubStock() {
        if (!supabase) return;
        const { data } = await supabase.from('hub_inventory').select('*').eq('product_id', product.id);
        if (data) {
            const hStock: Record<string, string> = {};
            data.forEach((hs: { hub_id: string, stock_level: number }) => hStock[hs.hub_id] = String(hs.stock_level));
            setHubStock(hStock);
        }
    }
    fetchHubStock();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const cancelEditing = () => {
    selectedImagePreviews.forEach(URL.revokeObjectURL);
    setEditingId(null);
    setForm(scopedInitialForm);
    setVariantStock({});
    setVariantPrices({});
    setBeverageSpecs([]);
    setSelectedFiles([]);
    setSelectedImagePreviews([]);
    setExistingImages([]);
    setFormSession(0);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManageInventory) return;
    setIsSubmitting(true);
    const uploadedPaths: string[] = [];
    let productSaved = false;

    try {
      const currentVariants = form.sizes.split(',').map(size => size.trim()).filter(Boolean);
      const vStock: Record<string, number> = {};
      currentVariants.forEach(variant => vStock[variant] = Number(variantStock[variant] || 0));
      const vPrices: Record<string, number> = {};
      for (const variant of currentVariants) {
          const value = variantPrices[variant]?.trim();
          if (!value) continue;
          const price = Number(value);
          if (!Number.isFinite(price) || price < 0) {
              throw new Error(`Enter a valid non-negative price for ${variant}.`);
          }
          vPrices[variant] = price;
      }

      const imageUrls = [...existingImages];

      if (selectedFiles.length > 0) {
          for (const file of selectedFiles) {
              const formData = new FormData();
              formData.set('file', file);
              const response = await fetch('/api/admin/product-image', { method: 'POST', body: formData });
              const result = await response.json() as { path?: string; image_url?: string; error?: string };
              if (!response.ok || !result.path || !result.image_url) {
                  throw new Error(result.error || 'Product image upload failed.');
              }
              uploadedPaths.push(result.path);
              imageUrls.push(result.image_url);
          }
      }

      const specs: Record<string, string> = {
          abv: form.abv_label,
          abv_label: form.abv_label,
          origin: form.origin,
          region: form.region,
          body: form.body,
          sweetness: form.sweetness,
          glassware: form.glassware
      };
      beverageSpecs.forEach(s => { if (s.key) specs[s.key] = s.value; });

      const productData = {
          name: form.name.trim(),
          brand: form.brand.trim(),
          origin: form.origin.trim(),
          region: form.region.trim(),
          body: form.body.trim(),
          sweetness: form.sweetness.trim(),
          abv_label: form.abv_label.trim(),
          size_label: form.size_label.trim(),
          manufacturer: form.manufacturer.trim(),
          price: Number(form.price),
          old_price: form.old_price ? Number(form.old_price) : null,
          cost_price: Number(form.cost_price),
          is_on_offer: form.is_on_offer || (form.old_price ? Number(form.old_price) > Number(form.price) : false),
          description: form.description,
          image_url: imageUrls[0] || '',
          images: imageUrls,
          sizes: currentVariants,
          stock: Object.values(vStock).reduce((a, b) => a + b, 0),
          variant_stock: vStock,
          variant_prices: vPrices,
          beverage_specs: isExtrasPage ? {} : specs,
          category: isExtrasPage ? 'extras' : form.category,
          sub_category: form.sub_category.trim() || null,
          is_featured: form.is_featured,
          is_snack: form.is_snack,
          hide_product: form.hide_product,
          // 🛡️ [SCHEMA_SAFETY] Optional Fields
          low_stock_alert: Number(form.low_stock_alert) || 5,
          sensory_metrics: {
              body: Number(form.sensory_metrics_body),
              sweet: Number(form.sensory_metrics_sweet),
              smoke: Number(form.sensory_metrics_smoke),
              spice: Number(form.sensory_metrics_spice)
          },
          pairing_suggestions: form.pairing_suggestions ? form.pairing_suggestions.split(',').map(s => s.trim()) : [],
          bought_together_ids: form.bought_together_ids ? form.bought_together_ids.split(',').map(s => Number(s.trim())).filter(n => !isNaN(n)) : []
      };

      const currentPayload: Record<string, unknown> = { ...productData };
      const saveResponse = await fetch('/api/admin/products', {
          method: editingId ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(editingId ? { id: editingId, product: currentPayload } : { product: currentPayload })
      });
      const saveResult = await saveResponse.json() as { id?: number; error?: string };
      if (!saveResponse.ok || typeof saveResult.id !== 'number') {
          throw new Error(saveResult.error || 'Product could not be saved.');
      }
      const savedId = saveResult.id;
      productSaved = true;

      await logAuditAction(email || 'admin', editingId ? 'UPDATE_PRODUCT' : 'CREATE_PRODUCT', { id: savedId, name: productData.name });
      setMessage({ type: 'success', text: editingId ? `Product #${savedId} Refined & Saved!` : `Product #${savedId} Ingested to Cellar Hub!` });
      setTimeout(() => setMessage(null), 4000);
      cancelEditing();
      fetchProducts();
      fetchProducts();
      setMessage({ type: 'success', text: 'Grid Node Synchronized!' });
      setTimeout(() => setMessage(null), 3000);
    } catch (err: unknown) {
        const error = err as Error;
        if (!productSaved && uploadedPaths.length > 0) {
            try {
                const cleanupFailures = (await Promise.all(uploadedPaths.map(async path => {
                    const response = await fetch('/api/admin/product-image', {
                        method: 'DELETE',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ path })
                    });
                    if (response.ok) return null;
                    const result = await response.json() as { error?: string };
                    return result.error || `Could not clean up ${path}.`;
                }))).filter((failure): failure is string => failure !== null);
                if (cleanupFailures.length > 0) {
                    console.error('[ProductUpload] Image cleanup failed:', cleanupFailures);
                    setMessage({ type: 'error', text: `${error.message} ${cleanupFailures.join(' ')}` });
                    return;
                }
            } catch (cleanupError) {
                console.error('[ProductUpload] Image cleanup failed:', cleanupError);
                setMessage({
                    type: 'error',
                    text: `${error.message} Image cleanup failed: ${cleanupError instanceof Error ? cleanupError.message : 'Unknown cleanup error.'}`
                });
                return;
            }
        }
        setMessage({ type: 'error', text: error.message });
    } finally {
        setIsSubmitting(false);
    }
  };

  const handleDeleteProduct = async (id: number) => {
    if (!canManageInventory) return;
    if (!window.confirm("Expunge this node from the global catalogue?")) return;
    try {
        const response = await fetch('/api/admin/products', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id })
        });
        const result = await response.json() as { error?: string };
        if (!response.ok) throw new Error(result.error || 'Product could not be deleted.');
        await logAuditAction(email || 'admin', 'DELETE_PRODUCT', { id });
        fetchProducts();
        cancelEditing();
        setMessage({ type: 'success', text: 'Node expelled from grid.' });
    } catch (err: unknown) {
        const error = err as Error;
        console.error(error);
    }
  };

  const generateSupplierPO = () => {
    const low = visibleProducts.filter(p => p.stock <= 5);
    const doc = new jsPDF();
    doc.text('Online Bar Purchase Order', 14, 20);
    autoTable(doc, {
        startY: 30,
        head: [['ID', 'Name', 'Stock']],
        body: low.map(p => [p.id, p.name, p.stock])
    });
    doc.save('OnlineBar_PO.pdf');
  };

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-8 sm:px-6 lg:px-8 text-left selection:bg-primary/20">
      <div className="mx-auto flex max-w-7xl flex-col gap-8">

        {/* HEADER HUB */}
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6 bg-white p-8 rounded-[3rem] border border-slate-100 shadow-sm relative overflow-hidden group">
            <div className="relative z-10 space-y-2 text-left">
                <div className="flex items-center gap-3">
                    <div className="h-2 w-2 rounded-full bg-primary animate-pulse"></div>
                        <span className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-400">{isExtrasPage ? 'Extras Studio' : 'Cellar Master'}</span>
                </div>
                <h1 className="text-4xl font-black tracking-tighter text-foreground uppercase leading-none">
                  {editingId ? 'Refine Product' : isExtrasPage ? 'Extras Inventory' : 'Inventory Master'}
                </h1>
                <p className="text-slate-500 text-sm font-medium italic">
                    {isExtrasPage ? 'Upload and manage extras, add product photos, and organize them by storefront type.' : 'Deploy premium beverage inventory to the online bar.'}
                </p>
            </div>

            {message && (
                <div className={cn(
                    "p-4 rounded-[1.5rem] border flex items-center gap-3 animate-in fade-in slide-in-from-top-2",
                    message.type === 'success' ? "bg-primary/10 border-primary/20 text-primary" : "bg-rose-50 border-rose-100 text-rose-600"
                )}>
                    <Layers className="h-5 w-5" />
                    <p className="text-xs font-black uppercase tracking-widest">{message.text}</p>
                </div>
            )}

            <div className="flex items-center gap-4 relative z-10">
                <Button variant="outline" onClick={generateSupplierPO} className="h-12 px-6 rounded-xl border-slate-200 bg-white font-black uppercase text-[9px] tracking-widest">
                    <Download className="h-3 w-3 mr-2" /> PO
                </Button>
                {editingId && (
                    <Button onClick={cancelEditing} variant="outline" className="h-12 px-6 rounded-xl border-rose-200 text-rose-500 hover:bg-rose-50 font-black uppercase text-[9px]">Abort</Button>
                )}
            </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
          <div className="lg:col-span-7 space-y-8">
            <form key={`form-${editingId || 'new'}-${formSession}`} onSubmit={handleSubmit} className="space-y-8">

              <Card className="rounded-[3rem] border border-slate-100 shadow-sm overflow-visible bg-white">
                  <button type="button" onClick={() => toggleSection('basic')} className="w-full p-8 flex items-center justify-between hover:bg-slate-50 transition-colors rounded-t-[3rem]">
                      <div className="flex items-center gap-4">
                          <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary shadow-sm"><Info className="h-5 w-5" /></div>
                          <div className="text-left">
                              <h2 className="text-lg font-black text-foreground uppercase tracking-tighter">Basic Information</h2>
                              <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Identify beverage specs</p>
                          </div>
                      </div>
                      {openSections.basic ? <ChevronUp className="h-5 w-5 text-slate-300" /> : <ChevronDown className="h-5 w-5 text-slate-300" />}
                  </button>
                  {openSections.basic && (
                      <CardContent className="p-10 pt-0 space-y-6 text-left">
                          <div className="grid sm:grid-cols-2 gap-6">
                              <div className="space-y-2 text-left">
                                  <label className="text-[9px] font-black uppercase text-slate-400 ml-1">Product Name</label>
                                  <Input name="name" value={form.name} onChange={handleInputChange} className="h-14 rounded-2xl border-slate-100 bg-slate-50 font-bold" required />
                              </div>
                              <div className="space-y-2 text-left">
                                  <label className="text-[9px] font-black uppercase text-slate-400 ml-1">Brand</label>
                                  <Input name="brand" value={form.brand} onChange={handleInputChange} className="h-14 rounded-2xl border-slate-100 bg-slate-50" />
                              </div>
                          </div>
                          <div className="grid sm:grid-cols-2 gap-6">
                              <div className="space-y-2 text-left">
                                  <label className="text-[9px] font-black uppercase text-slate-400 ml-1">Category</label>
                                <select name="category" value={form.category} onChange={handleInputChange} disabled={isExtrasPage} className="w-full h-14 rounded-2xl border border-slate-100 bg-slate-50 px-4 text-xs font-black uppercase outline-none focus:ring-2 focus:ring-primary disabled:cursor-not-allowed disabled:opacity-70">
                                    {categoryOptions.map(cat => <option key={cat.id} value={cat.id}>{cat.label}</option>)}
                                </select>
                              </div>
                              <div className="space-y-2 text-left">
                                  <label className="text-[9px] font-black uppercase text-slate-400 ml-1">Storefront Type / Subcategory</label>
                                  <Input name="sub_category" value={form.sub_category} onChange={handleInputChange} className="h-14 rounded-2xl border-slate-100 bg-slate-50" placeholder="e.g. Corkscrews & Bottle Openers" />
                                  <p className="px-1 text-xs text-slate-400">This creates the type filter on the Extras storefront page.</p>
                              </div>
                              <div className="space-y-2 text-left flex items-end gap-2">
                                  <div className="flex-1 space-y-2">
                                      <label className="text-[9px] font-black uppercase text-slate-400 ml-1">SKU</label>
                                      <Input name="sku" value={form.sku} onChange={handleInputChange} className="h-14 rounded-2xl border-slate-100 bg-slate-50 font-mono" />
                                  </div>
                                  <Button type="button" onClick={triggerBarScanner} variant="outline" className="h-14 w-14 rounded-2xl border-slate-100 bg-slate-50 text-slate-400 hover:text-primary">
                                      <Scan size={20} />
                                  </Button>
                              </div>
                          </div>
                          <label className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                          <input
                              type="checkbox"
                              name="hide_product"
                              checked={form.hide_product}
                              onChange={handleInputChange}
                              className="mt-0.5 h-4 w-4 accent-primary"
                          />
                          <span>
                              <span className="block text-xs font-black uppercase text-slate-800">Hide from storefront</span>
                              <span className="mt-1 block text-xs text-slate-500">Keep this product in admin inventory without showing it to customers.</span>
                          </span>
                          </label>
                      </CardContent>
                  )}
              </Card>

              {!isExtrasPage && <>
              {/* BEVERAGE SPECS & ORIGIN NODE */}
              <Card className="rounded-[3rem] border border-slate-100 shadow-sm overflow-visible bg-white">
                  <button type="button" onClick={() => toggleSection('beverageSpecs')} className="w-full p-8 flex items-center justify-between hover:bg-slate-50 transition-colors rounded-t-[3rem]">
                      <div className="flex items-center gap-4">
                          <div className="h-10 w-10 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-600 shadow-sm"><Wine className="h-5 w-5" /></div>
                          <div className="text-left">
                              <h2 className="text-lg font-black text-foreground uppercase tracking-tighter">Beverage Specs & Origin</h2>
                              <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Alcohol %, Country of Origin, Volume & Serve</p>
                          </div>
                      </div>
                      {openSections.beverageSpecs ? <ChevronUp className="h-5 w-5 text-slate-300" /> : <ChevronDown className="h-5 w-5 text-slate-300" />}
                  </button>
                  {openSections.beverageSpecs && (
                      <CardContent className="p-10 pt-0 space-y-6 text-left">
                          <div className="grid sm:grid-cols-3 gap-6">
                              <div className="space-y-2 text-left">
                                  <label className="text-[9px] font-black uppercase text-slate-400 ml-1">Alcohol Content (% ABV)</label>
                                  <Input name="abv_label" value={form.abv_label} onChange={handleInputChange} className="h-14 rounded-2xl border-slate-100 bg-slate-50 font-black text-amber-600" placeholder="e.g. 40% ABV" />
                              </div>
                              <div className="space-y-2 text-left">
                                  <label className="text-[9px] font-black uppercase text-slate-400 ml-1">Place / Country of Origin</label>
                                  <Input name="origin" value={form.origin} onChange={handleInputChange} className="h-14 rounded-2xl border-slate-100 bg-slate-50 font-bold" placeholder="e.g. Ireland, Scotland, France, SA" />
                              </div>
                              <div className="space-y-2 text-left">
                                  <label className="text-[9px] font-black uppercase text-slate-400 ml-1">Region / Terroir</label>
                                  <Input name="region" value={form.region} onChange={handleInputChange} className="h-14 rounded-2xl border-slate-100 bg-slate-50 font-bold" placeholder="e.g. Highlands, Bordeaux, Stellenbosch" />
                              </div>
                          </div>

                          <div className="grid sm:grid-cols-3 gap-6">
                              <div className="space-y-2 text-left">
                                  <label className="text-[9px] font-black uppercase text-slate-400 ml-1">Volume / Bottle Size</label>
                                  <Input name="size_label" value={form.size_label} onChange={handleInputChange} className="h-14 rounded-2xl border-slate-100 bg-slate-50 font-bold" placeholder="e.g. 750ml, 1L, 350ml" />
                              </div>
                              <div className="space-y-2 text-left">
                                  <label className="text-[9px] font-black uppercase text-slate-400 ml-1">Beverage Body Profile</label>
                                  <select name="body" value={form.body} onChange={handleInputChange} className="w-full h-14 rounded-2xl border border-slate-100 bg-slate-50 px-4 text-xs font-black uppercase outline-none focus:ring-2 focus:ring-primary">
                                      <option value="Light">Light</option>
                                      <option value="Medium">Medium</option>
                                      <option value="Full-bodied">Full-bodied</option>
                                      <option value="Crisp">Crisp</option>
                                  </select>
                              </div>
                              <div className="space-y-2 text-left">
                                  <label className="text-[9px] font-black uppercase text-slate-400 ml-1">Sweetness Profile</label>
                                  <select name="sweetness" value={form.sweetness} onChange={handleInputChange} className="w-full h-14 rounded-2xl border border-slate-100 bg-slate-50 px-4 text-xs font-black uppercase outline-none focus:ring-2 focus:ring-primary">
                                      <option value="Dry">Dry</option>
                                      <option value="Off-dry">Off-dry</option>
                                      <option value="Medium Sweet">Medium Sweet</option>
                                      <option value="Sweet">Sweet</option>
                                  </select>
                              </div>
                          </div>

                          <div className="grid sm:grid-cols-2 gap-6">
                              <div className="space-y-2 text-left">
                                  <label className="text-[9px] font-black uppercase text-slate-400 ml-1">Distillery / Manufacturer</label>
                                  <Input name="manufacturer" value={form.manufacturer} onChange={handleInputChange} className="h-14 rounded-2xl border-slate-100 bg-slate-50 font-medium" placeholder="e.g. Midleton Distillery" />
                              </div>
                              <div className="space-y-2 text-left">
                                  <label className="text-[9px] font-black uppercase text-slate-400 ml-1">Perfect Serve Glassware</label>
                                  <Input name="glassware" value={form.glassware} onChange={handleInputChange} className="h-14 rounded-2xl border-slate-100 bg-slate-50 font-medium" placeholder="e.g. Highball Glass, Tumbler, Flute" />
                              </div>
                          </div>
                      </CardContent>
                  )}
              </Card>
              </>}

              {/* PRICING & ECONOMICS */}
              <Card className="rounded-[3rem] border border-slate-100 shadow-sm overflow-visible bg-white">
                  <button type="button" onClick={() => toggleSection('pricing')} className="w-full p-8 flex items-center justify-between hover:bg-slate-50 transition-colors rounded-t-[3rem]">
                      <div className="flex items-center gap-4">
                          <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary shadow-sm"><ProfitIcon className="h-5 w-5" /></div>
                          <div className="text-left">
                              <h2 className="text-lg font-black text-foreground uppercase tracking-tighter">Economic Hub</h2>
                              <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Margins & Tactical Pricing</p>
                          </div>
                      </div>
                      {openSections.pricing ? <ChevronUp className="h-5 w-5 text-slate-300" /> : <ChevronDown className="h-5 w-5 text-slate-300" />}
                  </button>
                  {openSections.pricing && (
                      <CardContent className="p-10 pt-0 space-y-8">
                          <div className="grid sm:grid-cols-3 gap-6">
                              <div className="space-y-2 text-left">
                                  <label className="text-[9px] font-black uppercase text-slate-400 ml-1">Sell Price / Fallback (Ksh)</label>
                                  <Input type="number" name="price" value={form.price} onChange={handleInputChange} className="h-14 rounded-2xl border-slate-100 bg-slate-50 font-black text-xl text-primary" required />
                              </div>
                              <div className="space-y-2 text-left">
                                  <label className="text-[9px] font-black uppercase text-slate-400 ml-1">Original Price (Before Discount)</label>
                                  <Input type="number" name="old_price" value={form.old_price} onChange={handleInputChange} className="h-14 rounded-2xl border-slate-100 bg-slate-50 font-bold text-slate-400 line-through" placeholder="e.g. 2800" />
                              </div>
                              <div className="space-y-2 text-left">
                                  <label className="text-[9px] font-black uppercase text-slate-400 ml-1">Unit Cost</label>
                                  <Input type="number" name="cost_price" value={form.cost_price} onChange={handleInputChange} className="h-14 rounded-2xl border-slate-100 bg-slate-50 font-bold text-slate-500" />
                              </div>
                          </div>

                          <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 flex items-center justify-between">
                              <div>
                                  <p className="text-[8px] font-black uppercase text-slate-400">Estimated Profit Margin</p>
                                  <p className={cn("text-sm font-black uppercase", profitIntel.profit >= 0 ? "text-emerald-600" : "text-rose-500")}>
                                      {formatPrice(profitIntel.profit)} per unit ({profitIntel.margin.toFixed(1)}% margin)
                                  </p>
                              </div>
                              <span className="text-[8px] font-black uppercase tracking-widest text-primary px-3 py-1 bg-primary/10 rounded-full">
                                  {profitIntel.margin > 40 ? 'High Velocity Margin' : 'Standard Tier'}
                              </span>
                          </div>

                          {/* STRATEGIC OFFER & SALE LINKAGE */}
                          <div className="p-6 rounded-2xl bg-amber-50 border border-amber-200/60 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                              <div className="space-y-1">
                                  <div className="flex items-center gap-2">
                                      <Zap className="h-4 w-4 text-amber-600 fill-current" />
                                      <span className="text-xs font-black uppercase text-amber-900 tracking-tight">Strategic Offer & Sale Link</span>
                                  </div>
                                  <p className="text-[10px] font-medium text-amber-800">
                                      Enabling offer mode publishes this drink directly to <span className="font-extrabold underline">/shop/category/sale</span> with discount badges.
                                  </p>
                              </div>

                              <div className="flex items-center gap-3 self-end sm:self-center">
                                  <Button
                                      type="button"
                                      onClick={() => {
                                          const currentPrice = Number(form.price) || 2000;
                                          const beforeDiscount = Math.round(currentPrice * 1.25);
                                          setForm(prev => ({
                                              ...prev,
                                              old_price: String(beforeDiscount),
                                              is_on_offer: true,
                                              category: 'sale'
                                          }));
                                      }}
                                      variant="outline"
                                      className="h-10 px-3 rounded-xl border-amber-300 text-amber-900 bg-white hover:bg-amber-100 font-black uppercase text-[9px] tracking-widest shadow-sm"
                                  >
                                      Apply 20% Offer
                                  </Button>

                                  <label className="flex items-center gap-2 cursor-pointer bg-white px-3 py-2 rounded-xl border border-amber-200">
                                      <input
                                          type="checkbox"
                                          name="is_on_offer"
                                          checked={!!form.is_on_offer}
                                          onChange={handleInputChange}
                                          className="h-4 w-4 accent-amber-600 rounded"
                                      />
                                      <span className="text-[10px] font-black uppercase text-amber-900">Active Offer</span>
                                  </label>
                              </div>
                          </div>
                      </CardContent>
                  )}
              </Card>

              {/* INVENTORY & VARIANTS */}
              <Card className="rounded-[3rem] border border-slate-100 shadow-sm overflow-visible bg-white">
                  <button type="button" onClick={() => toggleSection('inventory')} className="w-full p-8 flex items-center justify-between hover:bg-slate-50 transition-colors rounded-t-[3rem]">
                      <div className="flex items-center gap-4">
                          <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary shadow-sm"><Layers className="h-5 w-5" /></div>
                          <div className="text-left">
                              <h2 className="text-lg font-black text-foreground uppercase tracking-tighter">Inventory Sync</h2>
                              <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Neural Stock & Variants</p>
                          </div>
                      </div>
                      {openSections.inventory ? <ChevronUp className="h-5 w-5 text-slate-300" /> : <ChevronDown className="h-5 w-5 text-slate-300" />}
                  </button>
                  {openSections.inventory && (
                      <CardContent className="p-10 pt-0 space-y-10">
                          <div className="space-y-4 text-left">
                              <label className="text-[10px] font-black uppercase text-slate-400 ml-1">Sizes / Portions (Comma Separated)</label>
                              <Input name="sizes" value={form.sizes} onChange={handleInputChange} className="h-14 rounded-2xl border-slate-100 bg-slate-50 font-bold" placeholder="e.g. 750ml, 1 Litre" />
                          </div>

                          {currentVariants.length > 0 && (
                              <div className="space-y-3 text-left">
                                  <div>
                                      <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-600">Price and stock for each size</h3>
                                      <p className="mt-1 text-xs text-slate-400">Leave a size price blank to use the Sell Price fallback below.</p>
                                  </div>
                                  <div className="grid sm:grid-cols-2 gap-4">
                                      {currentVariants.map(variant => (
                                          <div key={variant} className="space-y-3 p-5 rounded-2xl bg-slate-50 border border-slate-100 group hover:border-primary/20 transition-all">
                                              <span className="block text-[10px] font-black uppercase text-slate-600">{variant}</span>
                                              <div className="grid grid-cols-2 gap-3">
                                                  <label className="space-y-1 text-xs font-bold text-slate-500">
                                                      Price (Ksh)
                                                      <Input
                                                        type="number"
                                                        min="0"
                                                        step="0.01"
                                                        value={variantPrices[variant] ?? ''}
                                                        onChange={(e) => handleVariantPriceChange(variant, e.target.value)}
                                                        className="h-10 rounded-xl border-slate-200 bg-white text-center font-black"
                                                        placeholder={form.price || 'Base price'}
                                                      />
                                                  </label>
                                                  <label className="space-y-1 text-xs font-bold text-slate-500">
                                                      Stock
                                                      <Input
                                                        type="number"
                                                        min="0"
                                                        value={variantStock[variant] || '0'}
                                                        onChange={(e) => handleVariantStockChange(variant, e.target.value)}
                                                        className="h-10 rounded-xl border-slate-200 bg-white text-center font-black"
                                                      />
                                                  </label>
                                              </div>
                                          </div>
                                      ))}
                                  </div>
                              </div>
                          )}

                          <div className="pt-6 border-t border-slate-50 flex items-center justify-between text-left">
                              <div className="space-y-1">
                                  <p className="text-[10px] font-black uppercase text-slate-400">Total Cellar Units</p>
                                  <h3 className="text-2xl font-black text-foreground">{Object.values(variantStock).reduce((a,b) => a + Number(b||0), 0)} Units</h3>
                              </div>
                              {stockIntelligence && (
                                  <div className="text-right">
                                      <p className="text-[8px] font-black uppercase text-primary">Runway Estimate</p>
                                      <p className="text-sm font-black text-slate-600">{stockIntelligence.daysRemaining} Days</p>
                                  </div>
                              )}
                          </div>
                      </CardContent>
                  )}
              </Card>

              {/* MEDIA HUB */}
              <Card className="rounded-[3rem] border border-slate-100 shadow-sm overflow-visible bg-white">
                  <button type="button" onClick={() => toggleSection('media')} className="w-full p-8 flex items-center justify-between hover:bg-slate-50 transition-colors rounded-t-[3rem]">
                      <div className="flex items-center gap-4">
                          <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary shadow-sm"><ImageIcon className="h-5 w-5" /></div>
                          <div className="text-left">
                              <h2 className="text-lg font-black text-foreground uppercase tracking-tighter">Media Hub</h2>
                              <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Visual Assets</p>
                          </div>
                      </div>
                      {openSections.media ? <ChevronUp className="h-5 w-5 text-slate-300" /> : <ChevronDown className="h-5 w-5 text-slate-300" />}
                  </button>
                  {openSections.media && (
                      <CardContent className="p-10 pt-0 space-y-10">
                          {/* Master Media Audit Summary */}
                          {Object.keys(imageAudits).length > 0 && (
                              <div className="bg-slate-50 p-6 rounded-[2rem] border border-slate-100 flex items-center justify-between">
                                  <div className="flex items-center gap-4">
                                      <div className="h-10 w-10 rounded-full bg-white flex items-center justify-center text-primary shadow-sm border border-slate-100">
                                          <Search size={20} />
                                      </div>
                                      <div>
                                          <p className="text-[8px] font-black uppercase text-slate-400 tracking-widest">Master Media Audit</p>
                                          <h4 className="text-sm font-black uppercase text-foreground">
                                              {Object.values(imageAudits).every(a => a.isApproved)
                                                ? "✓ All Assets Market Ready"
                                                : "⚠ Action Required on Low-Quality Assets"}
                                          </h4>
                                      </div>
                                  </div>
                              </div>
                          )}

                          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                              <div>
                                  <h3 className="text-sm font-black uppercase tracking-wide text-foreground">Product images</h3>
                                  <p className="mt-1 text-xs leading-relaxed text-slate-500">Select several photos together. Up to 4 images per product.</p>
                              </div>
                              <span className="text-xs font-bold text-slate-500">
                                  {existingImages.length + selectedFiles.length} / 4 selected
                              </span>
                          </div>

                          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
                              {existingImages.map((url, i) => {
                                  const fileName = url.split('/').pop() || '';
                                  const audit = imageAudits[fileName];
                                  return (
                                      <div key={`existing-${i}`} className="group relative aspect-square overflow-hidden rounded-2xl border border-slate-100 bg-slate-50 shadow-sm transition-all hover:shadow-xl sm:rounded-3xl">
                                          <Image src={normalizeImage(url)} width={400} height={400} className="w-full h-full object-contain p-4" alt="" />
                                          <button type="button" aria-label={`Remove image ${i + 1}`} onClick={() => removeExistingImage(i)} className="absolute right-2 top-2 z-40 rounded-lg bg-rose-500 p-2 text-white shadow-lg transition-opacity sm:opacity-0 sm:group-hover:opacity-100"><X size={14}/></button>

                                          {/* Visible Quality Badge */}
                                          {audit && (
                                              <div className={cn(
                                                  "absolute top-4 left-4 px-3 py-1 rounded-full text-[8px] font-black uppercase tracking-widest shadow-md z-30",
                                                  audit.isApproved ? "bg-emerald-500 text-white" : "bg-rose-500 text-white"
                                              )}>
                                                  {audit.score} - {audit.isApproved ? 'Optimal' : 'Low Quality'}
                                              </div>
                                          )}

                                          {/* Audit Details on Hover */}
                                          {audit && audit.issues.length > 0 && (
                                              <div className="absolute inset-0 bg-slate-900/90 backdrop-blur-sm p-6 flex flex-col justify-center gap-3 opacity-0 group-hover:opacity-100 transition-opacity z-20 overflow-y-auto no-scrollbar">
                                                  <p className="text-[10px] font-black uppercase text-primary tracking-[0.3em]">Issue Radar</p>
                                                  {audit.issues.map((iss, i) => (
                                                      <p key={i} className="text-[9px] text-white font-medium leading-relaxed">• {iss}</p>
                                                  ))}
                                              </div>
                                          )}
                                      </div>
                                  );
                              })}
                              {selectedFiles.map((file, i) => (
                                  <div key={`selected-${file.name}-${i}`} className="relative aspect-square overflow-hidden rounded-2xl border border-primary/20 bg-slate-50 shadow-sm sm:rounded-3xl">
                                      <Image src={selectedImagePreviews[i]} width={400} height={400} className="h-full w-full object-contain p-3" alt={`Selected product image ${i + 1}`} unoptimized />
                                      <span className="absolute bottom-2 left-2 right-2 truncate rounded-lg bg-slate-900/75 px-2 py-1 text-[9px] font-bold text-white">{file.name}</span>
                                      <button type="button" aria-label={`Remove selected image ${i + 1}`} onClick={() => removeSelectedImage(i)} className="absolute right-2 top-2 rounded-lg bg-rose-500 p-2 text-white shadow-lg"><X size={14}/></button>
                                  </div>
                              ))}
                              {existingImages.length + selectedFiles.length < 4 && (
                                  <label className="flex aspect-square cursor-pointer flex-col items-center justify-center gap-2 overflow-hidden rounded-2xl border-2 border-dashed border-slate-200 text-slate-400 shadow-inner transition-all hover:border-primary/50 hover:bg-primary/5 hover:text-primary sm:rounded-3xl">
                                      <input type="file" multiple accept="image/*" onChange={handleFileChange} className="sr-only" aria-label="Choose multiple product images" />
                                      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-50 sm:h-12 sm:w-12 sm:rounded-2xl"><Camera size={24} /></div>
                                      <span className="px-2 text-center text-[9px] font-black uppercase tracking-wide">Choose images</span>
                                      <span className="text-[9px]">Select multiple</span>
                                  </label>
                              )}
                          </div>
                          {selectedFiles.length > 0 && (
                              <Button type="button" onClick={handleVisionScan} disabled={isVisionScanning} className="h-10 rounded-xl bg-slate-900 px-4 text-[9px] font-black uppercase tracking-widest text-white shadow-xl">
                                  {isVisionScanning ? <Loader2 size={12} className="mr-2 animate-spin" /> : <Eye size={12} className="mr-2" />}
                                  Vision Scan
                              </Button>
                          )}
                      </CardContent>
                  )}
              </Card>

              {/* NARRATIVE & SPECS */}
              <Card className="rounded-[3rem] border border-slate-100 shadow-sm overflow-visible bg-white">
                  <button type="button" onClick={() => toggleSection('description')} className="w-full p-8 flex items-center justify-between hover:bg-slate-50 transition-colors rounded-t-[3rem]">
                      <div className="flex items-center gap-4">
                          <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary shadow-sm"><Zap className="h-5 w-5" /></div>
                          <div className="text-left">
                              <h2 className="text-lg font-black text-foreground uppercase tracking-tighter">Narrative Hub</h2>
                              <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Storytelling & Specs</p>
                          </div>
                      </div>
                      {openSections.description ? <ChevronUp className="h-5 w-5 text-slate-300" /> : <ChevronDown className="h-5 w-5 text-slate-300" />}
                  </button>
                  {openSections.description && (
                      <CardContent className="p-10 pt-0 space-y-8 text-left">
                          <div className="space-y-4 text-left">
                              <div className="flex justify-between items-center text-left">
                                  <label className="text-[10px] font-black uppercase text-slate-400 ml-1">Main Narrative</label>
                                  <Button type="button" onClick={handleGenerateDescription} disabled={isGenerating} variant="ghost" className="h-8 px-3 rounded-lg text-primary bg-primary/5 hover:bg-primary/10 font-black uppercase text-[8px]">
                                      {isGenerating ? <Loader2 size={10} className="animate-spin mr-2" /> : <Bot size={10} className="mr-2" />}
                                      Neural Compose
                                  </Button>
                              </div>
                              <Textarea name="description" value={form.description} onChange={handleInputChange} className="min-h-[150px] rounded-2xl bg-slate-50 border-slate-100 p-6 text-sm font-medium italic leading-relaxed" placeholder="Describe the tasting notes, history, and pairing..." />
                          </div>

                          <div className="space-y-6 text-left">
                              <div className="flex justify-between items-center text-left">
                                  <h3 className="text-xs font-black uppercase text-foreground">Beverage Specifications</h3>
                                  <Button type="button" onClick={handleAddSpec} variant="outline" className="h-8 w-8 rounded-lg border-slate-100 p-0"><Plus size={14} /></Button>
                              </div>
                              <div className="grid gap-3">
                                  {beverageSpecs.map((s, i) => (
                                      <div key={i} className="flex gap-2 items-center text-left">
                                          <Input value={s.key} onChange={e => handleSpecChange(i, 'key', e.target.value)} className="flex-1 h-10 rounded-xl bg-slate-50 border-slate-100 text-[10px] font-black uppercase" placeholder="Property (e.g. ABV)" />
                                          <Input value={s.value} onChange={e => handleSpecChange(i, 'value', e.target.value)} className="flex-1 h-10 rounded-xl bg-slate-50 border-slate-100 text-[10px] font-bold" placeholder="Value (e.g. 40%)" />
                                          <button type="button" onClick={() => handleRemoveSpec(i)} className="h-10 w-10 text-slate-300 hover:text-rose-500"><Trash2 size={16}/></button>
                                      </div>
                                  ))}
                              </div>
                          </div>

                          <div className="pt-6 border-t border-slate-50 space-y-6">
                                <h3 className="text-xs font-black uppercase text-foreground">Sensory Intelligence (0-100)</h3>
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                                    {[
                                        { k: 'sensory_metrics_body', l: 'Body' },
                                        { k: 'sensory_metrics_sweet', l: 'Sweet' },
                                        { k: 'sensory_metrics_smoke', l: 'Smoke' },
                                        { k: 'sensory_metrics_spice', l: 'Spice' },
                                    ].map(m => (
                                        <div key={m.k} className="space-y-2">
                                            <label className="text-[8px] font-black uppercase text-slate-400 ml-1">{m.l}</label>
                                            <Input
                                                name={m.k}
                                                type="number"
                                                value={String(form[m.k as keyof typeof form])}
                                                onChange={handleInputChange}
                                                className="h-10 rounded-xl bg-slate-50 border-slate-100 font-bold"
                                            />
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div className="space-y-6 pt-4 border-t border-slate-100">
                                {/* PAIRING CHIPS */}
                                <div className="space-y-3">
                                    <div className="flex justify-between items-center">
                                        <label className="text-[9px] font-black uppercase text-slate-400 ml-1">Goes well with · shown on the customer product page</label>
                                        <span className="text-[8px] font-bold text-slate-400 uppercase">Tap chip to toggle</span>
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                        {['Nyama Choma', 'BBQ Ribs', 'Smoked Brisket', 'Burgers', 'Dark Chocolate', 'Oysters', 'Aged Cheese', 'Sea Salt Crackers'].map(preset => {
                                            const active = (form.pairing_suggestions || '').split(',').map(s => s.trim()).includes(preset);
                                            return (
                                                <button
                                                    key={preset}
                                                    type="button"
                                                    onClick={() => {
                                                        const current = form.pairing_suggestions ? form.pairing_suggestions.split(',').map(s => s.trim()).filter(Boolean) : [];
                                                        const exists = current.includes(preset);
                                                        const updated = exists ? current.filter(p => p !== preset) : [...current, preset];
                                                        setForm(prev => ({ ...prev, pairing_suggestions: updated.join(', ') }));
                                                    }}
                                                    className={cn(
                                                        "px-3 py-1.5 rounded-full text-[9px] font-black uppercase tracking-wider transition-all border",
                                                        active
                                                            ? "bg-primary text-white border-primary shadow-sm"
                                                            : "bg-slate-50 border-slate-200 text-slate-500 hover:bg-slate-100"
                                                    )}
                                                >
                                                    {active ? '✓ ' : '+ '}{preset}
                                                </button>
                                            );
                                        })}
                                    </div>
                                    <Input name="pairing_suggestions" value={form.pairing_suggestions} onChange={handleInputChange} placeholder="Custom CSV e.g. Meat, Cheese" className="h-12 rounded-2xl bg-slate-50 border-slate-100 font-medium text-xs mt-2" />
                                </div>

                                {/* VISUAL BUNDLE UPSELL SELECTOR */}
                                <div className="space-y-3 pt-4 border-t border-slate-100">
                                    <div className="flex justify-between items-center">
                                        <label className="text-[9px] font-black uppercase text-slate-400 ml-1">Bundle Upsell Products (&quot;Frequently Bought Together&quot;)</label>
                                        <span className="text-[8px] font-bold text-primary uppercase">Select products to offer in bundle</span>
                                    </div>

                                    {/* Currently selected bundle products */}
                                    <div className="flex flex-wrap gap-3 p-3 bg-slate-50 rounded-2xl border border-slate-100 min-h-[50px] items-center">
                                        {(() => {
                                            const selectedIds = (form.bought_together_ids || '').split(',').map(s => Number(s.trim())).filter(n => !isNaN(n) && n > 0);
                                            if (selectedIds.length === 0) {
                                                return <p className="text-[10px] font-bold text-slate-400 uppercase italic">No bundle products linked yet. Select below to add.</p>;
                                            }
                                            return selectedIds.map(id => {
                                                const pMatch = products.find(p => p.id === id);
                                                return (
                                                    <div key={id} className="flex items-center gap-2 p-2 bg-white rounded-xl border border-slate-200 shadow-sm">
                                                        {pMatch?.image_url && (
                                                            <div className="h-6 w-6 relative rounded bg-slate-50 overflow-hidden">
                                                                <Image src={normalizeImage(pMatch.image_url)} alt="" fill className="object-contain" />
                                                            </div>
                                                        )}
                                                        <span className="text-[9px] font-black uppercase text-slate-800">{pMatch?.name || `ID #${id}`}</span>
                                                        <button
                                                            type="button"
                                                            onClick={() => {
                                                                const updated = selectedIds.filter(i => i !== id);
                                                                setForm(prev => ({ ...prev, bought_together_ids: updated.join(', ') }));
                                                            }}
                                                            className="h-4 w-4 rounded-full bg-slate-100 text-slate-400 hover:bg-rose-500 hover:text-white flex items-center justify-center transition-all"
                                                        >
                                                            <X size={10} />
                                                        </button>
                                                    </div>
                                                );
                                            });
                                        })()}
                                    </div>

                                    {/* Catalog Dropdown Picker */}
                                    <div className="space-y-2">
                                        <p className="text-[8px] font-black text-slate-400 uppercase">Click to add from store catalog:</p>
                                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-48 overflow-y-auto no-scrollbar p-1">
                                            {products.filter(p => p.id !== editingId).map(p => {
                                                const selectedIds = (form.bought_together_ids || '').split(',').map(s => Number(s.trim())).filter(n => !isNaN(n) && n > 0);
                                                const isSelected = selectedIds.includes(p.id);

                                                return (
                                                    <button
                                                        key={p.id}
                                                        type="button"
                                                        onClick={() => {
                                                            const updated = isSelected ? selectedIds.filter(i => i !== p.id) : [...selectedIds, p.id];
                                                            setForm(prev => ({ ...prev, bought_together_ids: updated.join(', ') }));
                                                        }}
                                                        className={cn(
                                                            "p-2.5 rounded-xl border text-left flex items-center gap-2 transition-all",
                                                            isSelected ? "bg-primary/10 border-primary text-primary" : "bg-white border-slate-100 hover:border-slate-300 text-slate-700"
                                                        )}
                                                    >
                                                        <div className="h-7 w-7 relative rounded bg-slate-50 shrink-0">
                                                            <Image src={normalizeImage(p.image_url)} alt="" fill className="object-contain" />
                                                        </div>
                                                        <div className="min-w-0 flex-1">
                                                            <p className="text-[8px] font-black uppercase truncate">{p.name}</p>
                                                            <p className="text-[7px] font-bold text-slate-400">{formatPrice(p.price)}</p>
                                                        </div>
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>

                                    <Input name="bought_together_ids" value={form.bought_together_ids} onChange={handleInputChange} placeholder="Raw IDs CSV e.g. 12, 45" className="h-10 rounded-xl bg-slate-50 border-slate-100 font-mono text-xs hidden" />
                                </div>
                            </div>
                      </CardContent>
                  )}
              </Card>

              {/* LOGISTICS NODE SYNC */}
              <Card className="rounded-[3rem] border border-slate-100 shadow-sm overflow-visible bg-white">
                  <button type="button" onClick={() => toggleSection('status')} className="w-full p-8 flex items-center justify-between hover:bg-slate-50 transition-colors rounded-t-[3rem]">
                      <div className="flex items-center gap-4">
                          <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary shadow-sm"><RefreshCcw className="h-5 w-5" /></div>
                          <div className="text-left">
                              <h2 className="text-lg font-black text-foreground uppercase tracking-tighter">Logistics Sync</h2>
                              <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Hub Distribution</p>
                          </div>
                      </div>
                      {openSections.status ? <ChevronUp className="h-5 w-5 text-slate-300" /> : <ChevronDown className="h-5 w-5 text-slate-300" />}
                  </button>
                  {openSections.status && (
                      <CardContent className="p-10 pt-0 space-y-6 text-left">
                          <div className="grid gap-4">
                              {hubs.map(hub => (
                                  <div key={hub.id} className="p-5 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-between text-left">
                                      <div className="flex items-center gap-4">
                                          <div className="h-8 w-8 rounded-lg bg-white border border-slate-100 flex items-center justify-center text-primary shadow-sm"><RefreshCcw size={14} /></div>
                                          <span className="text-[10px] font-black uppercase text-foreground">{hub.name}</span>
                                      </div>
                                      <div className="flex items-center gap-4">
                                          <span className="text-[8px] font-black uppercase text-slate-400">Hub Stock</span>
                                          <Input
                                            type="number"
                                            value={hubStock[hub.id] || '0'}
                                            readOnly // Logistics is read-only from this panel, managed by Dispatch
                                            className="w-20 h-10 rounded-xl border-slate-100 bg-white/50 text-center font-black text-slate-400"
                                          />
                                      </div>
                                  </div>
                              ))}
                          </div>
                      </CardContent>
                  )}
              </Card>

              <div className="pt-2">
                  <div className="flex gap-3">
                      <Button type="submit" data-behavior-id="upload.deploy_to_bar" disabled={isSubmitting} className="flex-1 h-16 rounded-2xl bg-primary text-white font-black uppercase tracking-[0.2em] text-xs hover:bg-primary/90 transition-all active:scale-95 shadow-xl shadow-primary/20">
                        {isSubmitting ? <Loader2 className="h-5 w-5 animate-spin mr-3" /> : <Wine className="h-5 w-5 mr-3" />}
                        {editingId ? 'Refine Grid Node' : 'Deploy to Bar'}
                      </Button>
                      {editingId && (
                          <Button type="button" onClick={() => handleDeleteProduct(editingId)} variant="ghost" className="h-16 px-8 rounded-2xl text-rose-500 bg-rose-50 hover:bg-rose-100"><Trash2 size={20}/></Button>
                      )}
                  </div>
              </div>

            </form>
          </div>

          <div className="lg:col-span-5 space-y-8">
              <div className="bg-white rounded-[3rem] border border-slate-100 shadow-sm overflow-hidden flex flex-col h-[800px] sticky top-8">
                  <div className="p-8 border-b border-slate-50 flex items-center justify-between">
                      <div>
                          <h2 className="text-xl font-black text-foreground uppercase tracking-tighter leading-none">{isExtrasPage ? 'Extras Inventory' : 'Cellar Inventory'}</h2>
                            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mt-2">{visibleProducts.length} Products</p>
                      </div>
                      <button onClick={fetchProducts} className="text-slate-300 hover:text-primary transition-colors"><RefreshCcw size={16} /></button>
                  </div>
                  <div className="flex-1 overflow-y-auto divide-y divide-slate-50 no-scrollbar">
                      {visibleProducts.map(p => (
                          <div key={p.id} onClick={() => startEditing(p)} className={cn("p-6 flex items-center justify-between hover:bg-slate-50 cursor-pointer transition-all group", editingId === p.id && "bg-primary/5 border-l-4 border-primary shadow-inner")}>
                              <div className="flex items-center gap-4 min-w-0">
                                  <div className="h-12 w-12 rounded-xl bg-slate-50 border border-slate-100 p-1 flex items-center justify-center shrink-0">
                                      <Image src={normalizeImage(p.image_url)} width={100} height={100} className="max-h-full w-auto object-contain" alt="" />
                                  </div>
                                  <div className="min-w-0">
                                      <p className="text-xs font-black uppercase truncate text-foreground group-hover:text-primary transition-colors">{p.name}</p>
                                      <div className="flex items-center gap-2">
                                          <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest whitespace-nowrap overflow-hidden text-ellipsis">{p.stock} Units • {p.sub_category || p.category}</p>
                                          {p.is_snack && <span className="px-1.5 py-0.5 rounded-md bg-indigo-50 text-indigo-500 text-[7px] font-black uppercase">Munchie</span>}
                                      </div>
                                  </div>
                              </div>
                              <ChevronRight className="h-4 w-4 text-slate-200 group-hover:text-primary group-hover:translate-x-1 transition-all" />
                          </div>
                      ))}
                  </div>
              </div>
          </div>
        </div>

        <div className="pt-8">
            <TacticalEventFeed
                title={isExtrasPage ? 'Extras Real-time Stock Stream' : 'Cellar Hub Real-time Stock Stream'}
                subtitle={isExtrasPage ? 'Live Extras Ingestion & Stock Rebalance Telemetry' : 'Live Inventory Ingestion & Stock Rebalance Telemetry'}
            />
        </div>
      </div>
    </div>
  );
}
