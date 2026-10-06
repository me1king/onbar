'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import Link from 'next/link';
import Image from 'next/image';
import { Badge } from '@/components/ui/badge';
import { Calendar, User, ArrowRight, BookOpen, RefreshCw } from 'lucide-react';

interface BlogPost {
  id: number;
  title: string;
  slug: string;
  excerpt: string;
  image_url: string;
  author: string;
  created_at: string;
}

export default function BlogListPage() {
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    async function loadPosts() {
      if (!supabase) {
        setLoadError('The mixology guides are unavailable because the store connection is not configured.');
        setLoading(false);
        return;
      }
      try {
        const { data, error } = await supabase
          .from('blog_posts')
          .select('*')
          .eq('is_published', true)
          .order('created_at', { ascending: false });
        if (error) throw error;
        setPosts(data || []);
      } catch (err) {
        console.error('Could not load published mixology guides:', err);
        setLoadError(err instanceof Error ? err.message : 'Could not load mixology guides.');
      } finally {
        setLoading(false);
      }
    }
    loadPosts();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-white">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary"></div>
        <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Opening Hub...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white text-left">
      {/* Hero Header */}
      <section className="relative overflow-hidden border-b border-slate-100 bg-slate-50 py-14 sm:py-20 lg:py-24">
          <div className="relative z-10 mx-auto max-w-7xl px-4 text-center sm:px-6 lg:px-8">
              <Badge className="mb-6 bg-primary/10 text-primary border-none font-black uppercase text-[10px] tracking-widest px-4 py-2 rounded-full">Mixology Hub</Badge>
              <h1 className="text-5xl lg:text-7xl font-black text-foreground uppercase tracking-tighter leading-none mb-8">
                  Drink <span className="text-primary italic">Guides.</span>
              </h1>
              <p className="text-slate-500 text-lg font-medium max-w-2xl mx-auto">
                  Master your mixology with our tutorials, beverage reviews, and pairing guides for Kenyan patrons.
              </p>
          </div>
          <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 rounded-full blur-3xl -z-0"></div>
      </section>

      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 sm:py-16 lg:px-8 lg:py-20">
        {loadError ? (
          <div role="alert" className="mx-auto max-w-xl rounded-2xl border border-rose-200 bg-rose-50 p-6 text-center">
            <p className="font-bold text-rose-700">{loadError}</p>
            <button type="button" onClick={() => window.location.reload()} className="mt-4 inline-flex items-center gap-2 text-sm font-bold text-rose-800 underline underline-offset-4">
              <RefreshCw size={15} /> Try again
            </button>
          </div>
        ) : posts.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-slate-200 bg-slate-50 py-12 text-center sm:py-16">
            <BookOpen className="h-12 w-12 text-slate-200 mx-auto mb-4" />
            <p className="text-slate-600 font-black uppercase text-xs tracking-widest">No published guides yet</p>
            <p className="mt-2 text-sm text-slate-500">We’ll add new drink guides here when they’re ready.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-3 lg:gap-12">
            {posts.map((post) => (
              <Link key={post.id} href={`/blog/${post.slug}`} className="group block">
                <article className="space-y-6">
                  <div className="aspect-[16/10] rounded-[2.5rem] bg-slate-50 overflow-hidden border border-slate-100 shadow-sm relative group-hover:shadow-2xl transition-all duration-500 group-hover:-translate-y-2">
                      <Image
                        src={post.image_url || '/images/NoImage.jpg'}
                        alt={post.title}
                        fill
                        className="object-cover transform group-hover:scale-110 transition-transform duration-700"
                      />
                      <div className="absolute top-6 left-6 bg-white/90 backdrop-blur-md px-3 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-widest border border-white/50">
                          Drink Tips
                      </div>
                  </div>
                  <div className="px-2 space-y-3">
                    <div className="flex items-center gap-4 text-[10px] font-black uppercase tracking-widest text-slate-400">
                        <span className="flex items-center gap-1.5"><Calendar className="h-3 w-3" /> {new Date(post.created_at).toLocaleDateString()}</span>
                        <span className="flex items-center gap-1.5"><User className="h-3 w-3" /> {post.author}</span>
                    </div>
                    <h2 className="text-2xl font-black text-foreground uppercase tracking-tight leading-tight group-hover:text-primary transition-colors">{post.title}</h2>
                    <p className="text-slate-500 text-sm font-medium line-clamp-2 leading-relaxed italic">{post.excerpt}</p>
                    <div className="pt-2 flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-primary group-hover:gap-4 transition-all">
                        Read Full Guide <ArrowRight className="h-4 w-4" />
                    </div>
                  </div>
                </article>
              </Link>
            ))}
          </div>
        )}
      </div>

    </div>
  );
}
