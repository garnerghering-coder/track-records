import { useState, useRef } from "react";
import { articles as initialArticles, ARTICLE_CATEGORIES, type Article, type ArticleCategory } from "@/lib/articles-data";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Pencil, Trash2, Image as ImageIcon, Eye, Upload, Loader2 } from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

export default function ManageArticles() {
  const [articlesList, setArticlesList] = useState<Article[]>(initialArticles);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);

  const emptyForm: Article = {
    title: "", slug: "", date: new Date().toISOString().split("T")[0],
    category: "Session Breakdown", tags: [], author: "Track Records Editorial",
    heroImage: "", excerpt: "", body: "", images: [],
  };
  const [form, setForm] = useState<Article>(emptyForm);
  const [tagsInput, setTagsInput] = useState("");
  const [uploading, setUploading] = useState<string | null>(null);
  const heroInputRef = useRef<HTMLInputElement>(null);

  const openNew = () => { setEditingIndex(null); setForm(emptyForm); setTagsInput(""); setDialogOpen(true); };
  const openEdit = (idx: number) => { setEditingIndex(idx); setForm(articlesList[idx]); setTagsInput(articlesList[idx].tags.join(", ")); setDialogOpen(true); };

  const uploadFile = async (file: File, target: string): Promise<string | null> => {
    setUploading(target);
    try {
      const ext = file.name.split(".").pop();
      const path = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
      const { error } = await supabase.storage.from("article-images").upload(path, file);
      if (error) throw error;
      const { data: { publicUrl } } = supabase.storage.from("article-images").getPublicUrl(path);
      return publicUrl;
    } catch (e: any) {
      toast.error(e.message || "Upload failed");
      return null;
    } finally {
      setUploading(null);
    }
  };

  const handleHeroUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = await uploadFile(file, "hero");
    if (url) setForm({ ...form, heroImage: url });
  };

  const handleImageUpload = async (idx: number, file: File) => {
    const url = await uploadFile(file, `img-${idx}`);
    if (url) {
      const imgs = [...form.images];
      imgs[idx] = { ...imgs[idx], url };
      setForm({ ...form, images: imgs });
    }
  };

  const handleSave = () => {
    if (!form.title.trim() || !form.slug.trim()) { toast.error("Title and slug are required"); return; }
    const updated = { ...form, tags: tagsInput.split(",").map(t => t.trim()).filter(Boolean) };
    if (editingIndex !== null) {
      const copy = [...articlesList]; copy[editingIndex] = updated; setArticlesList(copy); toast.success("Article updated");
    } else {
      setArticlesList([updated, ...articlesList]); toast.success("Article created");
    }
    setDialogOpen(false);
  };

  const handleDelete = (idx: number) => { setArticlesList(articlesList.filter((_, i) => i !== idx)); toast.success("Article deleted"); };
  const autoSlug = (title: string) => title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

  const addImagePlaceholder = () => {
    setForm({ ...form, images: [...form.images, { url: "", alt: "", caption: "" }] });
  };

  const updateImage = (idx: number, field: string, value: string) => {
    const imgs = [...form.images];
    (imgs[idx] as any)[field] = value;
    setForm({ ...form, images: imgs });
  };

  const insertImageTag = (idx: number) => {
    setForm({ ...form, body: form.body + `\n\n{{IMAGE:${idx}}}\n\n` });
    toast.info(`Image placeholder {{IMAGE:${idx}}} inserted at end of body`);
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-xl font-bold text-foreground">Articles</h1>
          <p className="text-sm text-muted-foreground">Manage editorial content</p>
        </div>
        <Button size="sm" onClick={openNew}><Plus className="h-4 w-4 mr-1" /> New Article</Button>
      </div>

      <div className="space-y-2">
        {articlesList.map((article, idx) => (
          <div key={article.slug} className="flex items-center gap-4 rounded-lg border border-border bg-card p-3">
            {article.heroImage && <img src={article.heroImage} alt="" className="h-12 w-20 rounded object-cover bg-secondary shrink-0" />}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground truncate">{article.title}</p>
              <div className="flex items-center gap-2 mt-0.5">
                <Badge variant="secondary" className="text-[10px]">{article.category}</Badge>
                <span className="text-[10px] text-muted-foreground">{article.date}</span>
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <Link to={`/articles/${article.slug}`} target="_blank">
                <Button variant="ghost" size="icon" className="h-8 w-8"><Eye className="h-3.5 w-3.5" /></Button>
              </Link>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(idx)}><Pencil className="h-3.5 w-3.5" /></Button>
              <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => handleDelete(idx)}><Trash2 className="h-3.5 w-3.5" /></Button>
            </div>
          </div>
        ))}
        {articlesList.length === 0 && <p className="text-sm text-muted-foreground text-center py-8">No articles yet.</p>}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display">{editingIndex !== null ? "Edit Article" : "New Article"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs">Title</Label>
                <Input value={form.title} onChange={(e) => { const title = e.target.value; setForm({ ...form, title, slug: editingIndex === null ? autoSlug(title) : form.slug }); }} className="h-9 text-sm" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Slug</Label>
                <Input value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} className="h-9 text-sm" />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs">Date</Label>
                <Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className="h-9 text-sm" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Category</Label>
                <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v as ArticleCategory })}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>{ARTICLE_CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Author</Label>
                <Input value={form.author} onChange={(e) => setForm({ ...form, author: e.target.value })} className="h-9 text-sm" />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Tags (comma-separated)</Label>
              <Input value={tagsInput} onChange={(e) => setTagsInput(e.target.value)} placeholder="IMSA, Sebring, Strategy" className="h-9 text-sm" />
            </div>

            {/* Hero Image Upload */}
            <div className="space-y-1.5">
              <Label className="text-xs">Hero Image</Label>
              <input type="file" ref={heroInputRef} accept="image/*" onChange={handleHeroUpload} className="hidden" />
              <div className="flex items-center gap-3">
                <Button variant="outline" size="sm" onClick={() => heroInputRef.current?.click()} disabled={uploading === "hero"}>
                  {uploading === "hero" ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Upload className="h-3.5 w-3.5 mr-1" />}
                  Upload Image
                </Button>
                {form.heroImage && <img src={form.heroImage} alt="" className="h-10 rounded object-cover" />}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Excerpt</Label>
              <Textarea value={form.excerpt} onChange={(e) => setForm({ ...form, excerpt: e.target.value })} rows={2} className="text-sm" />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">
                Body Content{" "}
                <span className="text-muted-foreground">(use ## for headings, **bold**, - for lists, {"{{IMAGE:N}}"} for images)</span>
              </Label>
              <Textarea value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} rows={12} className="text-sm font-mono" />
            </div>

            {/* Images */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-xs">Embedded Images</Label>
                <Button variant="outline" size="sm" onClick={addImagePlaceholder}><ImageIcon className="h-3.5 w-3.5 mr-1" /> Add Image</Button>
              </div>
              {form.images.map((img, idx) => (
                <div key={idx} className="rounded border border-border p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-muted-foreground">
                      Image {idx} — <code className="text-primary">{`{{IMAGE:${idx}}}`}</code>
                    </span>
                    <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => insertImageTag(idx)}>Insert Tag</Button>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="file"
                      accept="image/*"
                      id={`img-upload-${idx}`}
                      className="hidden"
                      onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImageUpload(idx, f); }}
                    />
                    <Button variant="outline" size="sm" onClick={() => document.getElementById(`img-upload-${idx}`)?.click()} disabled={uploading === `img-${idx}`}>
                      {uploading === `img-${idx}` ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Upload className="h-3.5 w-3.5 mr-1" />}
                      Upload
                    </Button>
                    {img.url && <img src={img.url} alt={img.alt} className="h-12 rounded object-cover" />}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Input value={img.alt} onChange={(e) => updateImage(idx, "alt", e.target.value)} placeholder="Alt text" className="h-8 text-xs" />
                    <Input value={img.caption || ""} onChange={(e) => updateImage(idx, "caption", e.target.value)} placeholder="Caption (optional)" className="h-8 text-xs" />
                  </div>
                </div>
              ))}
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button onClick={handleSave}>{editingIndex !== null ? "Save Changes" : "Create Article"}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}