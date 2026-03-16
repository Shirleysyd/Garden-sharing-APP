/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import { 
  auth, db, googleProvider, 
  OperationType, handleFirestoreError 
} from './firebase';
import { 
  signInWithPopup, signOut, onAuthStateChanged, User 
} from 'firebase/auth';
import { 
  collection, doc, setDoc, getDoc, getDocs, 
  query, orderBy, limit, onSnapshot, 
  Timestamp, addDoc, updateDoc, increment, 
  deleteDoc, where, serverTimestamp 
} from 'firebase/firestore';
import { 
  Leaf, Home, Search, PlusSquare, User as UserIcon, 
  Droplets, MessageCircle, LogOut, Camera, 
  ChevronLeft, Send, Trash2, Edit2, MoreVertical
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { formatDistanceToNow } from 'date-fns';
import { UserProfile, GardenPost, PostComment } from './types';

// Helper to safely format Firestore timestamps
function formatDate(timestamp: any) {
  if (!timestamp || typeof timestamp.toDate !== 'function') {
    return 'Just now';
  }
  try {
    return formatDistanceToNow(timestamp.toDate(), { addSuffix: true });
  } catch (e) {
    return 'Recently';
  }
}

// Utility for tailwind classes
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// --- Components ---

const Button = ({ 
  className, variant = 'primary', ...props 
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost' | 'danger' }) => {
  const variants = {
    primary: 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm',
    secondary: 'bg-stone-200 text-stone-800 hover:bg-stone-300',
    ghost: 'bg-transparent text-stone-600 hover:bg-stone-100',
    danger: 'bg-red-50 text-red-600 hover:bg-red-100',
  };
  return (
    <button 
      className={cn('px-4 py-2 rounded-xl font-medium transition-all active:scale-95 disabled:opacity-50', variants[variant], className)} 
      {...props} 
    />
  );
};

const Input = ({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) => (
  <input 
    className={cn('w-full px-4 py-3 bg-white border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all', className)} 
    {...props} 
  />
);

const TextArea = ({ className, ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) => (
  <textarea 
    className={cn('w-full px-4 py-3 bg-white border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all resize-none', className)} 
    {...props} 
  />
);

// --- Main App ---

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentScreen, setCurrentScreen] = useState<'home' | 'search' | 'create' | 'profile' | 'post-detail'>('home');
  const [selectedPostId, setSelectedPostId] = useState<string | null>(null);
  const [scrollToComments, setScrollToComments] = useState(false);
  const [posts, setPosts] = useState<GardenPost[]>([]);
  const [userWaters, setUserWaters] = useState<Set<string>>(new Set());

  // Auth Listener
  useEffect(() => {
    return onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        const userDoc = await getDoc(doc(db, 'users', u.uid));
        if (userDoc.exists()) {
          setProfile(userDoc.data() as UserProfile);
        } else {
          const newProfile: UserProfile = {
            uid: u.uid,
            displayName: u.displayName || 'Gardener',
            photoURL: u.photoURL || undefined,
            bio: 'Happy gardening!',
            followersCount: 0,
            followingCount: 0,
            role: 'user'
          };
          await setDoc(doc(db, 'users', u.uid), newProfile);
          setProfile(newProfile);
        }

        // Listen to user's waters
        const watersQuery = query(collection(db, 'waters'), where('userId', '==', u.uid));
        onSnapshot(watersQuery, (snapshot) => {
          const wateredIds = new Set(snapshot.docs.map(d => d.data().postId));
          setUserWaters(wateredIds);
        });
      } else {
        setProfile(null);
        setUserWaters(new Set());
      }
      setLoading(false);
    });
  }, []);

  // Posts Listener
  useEffect(() => {
    const q = query(collection(db, 'posts'), orderBy('createdAt', 'desc'), limit(50));
    return onSnapshot(q, (snapshot) => {
      const p = snapshot.docs.map(d => ({ id: d.id, ...(d.data() as any) } as GardenPost));
      setPosts(p);
    });
  }, []);

  const handleLogin = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      console.error('Login failed', error);
    }
  };

  const handleLogout = () => signOut(auth);

  const handleWater = async (postId: string) => {
    if (!user) return;
    const waterId = `${user.uid}_${postId}`;
    const waterRef = doc(db, 'waters', waterId);
    const postRef = doc(db, 'posts', postId);

    try {
      if (userWaters.has(postId)) {
        await deleteDoc(waterRef);
        await updateDoc(postRef, { waterCount: increment(-1) });
      } else {
        await setDoc(waterRef, {
          userId: user.uid,
          postId,
          createdAt: serverTimestamp()
        });
        await updateDoc(postRef, { waterCount: increment(1) });
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `posts/${postId}`);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-stone-50 flex items-center justify-center">
        <motion.div 
          animate={{ rotate: 360 }}
          transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
        >
          <Leaf className="w-12 h-12 text-emerald-600" />
        </motion.div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-stone-50 flex flex-col items-center justify-center p-6 text-center">
        <div className="w-24 h-24 bg-emerald-100 rounded-full flex items-center justify-center mb-8">
          <Leaf className="w-12 h-12 text-emerald-600" />
        </div>
        <h1 className="text-4xl font-bold text-emerald-900 mb-4 font-serif">Garden Share</h1>
        <p className="text-stone-600 mb-12 max-w-xs">
          Join the community of garden enthusiasts. Share your growth, get tips, and water other gardens.
        </p>
        <Button onClick={handleLogin} className="w-full max-w-xs py-4 text-lg">
          Sign in with Google
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-stone-50 pb-24 max-w-md mx-auto shadow-xl relative">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-white/80 backdrop-blur-md border-bottom border-stone-200 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Leaf className="w-6 h-6 text-emerald-600" />
          <span className="text-xl font-bold text-emerald-900 font-serif">Garden Share</span>
        </div>
        <button onClick={handleLogout} className="p-2 text-stone-400 hover:text-red-500 transition-colors">
          <LogOut className="w-5 h-5" />
        </button>
      </header>

      <main className="p-4">
        <AnimatePresence mode="wait">
          {currentScreen === 'home' && (
            <motion.div 
              key="home"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-6"
            >
              {posts.length === 0 ? (
                <div className="text-center py-20 opacity-50">
                  <Leaf className="w-12 h-12 mx-auto mb-4" />
                  <p>No posts yet. Be the first to share your garden!</p>
                </div>
              ) : (
                posts.map(post => (
                  <PostCard 
                    key={post.id} 
                    post={post} 
                    isWatered={userWaters.has(post.id)}
                    onWater={() => handleWater(post.id)}
                    onClick={(scroll = false) => {
                      setSelectedPostId(post.id);
                      setScrollToComments(scroll);
                      setCurrentScreen('post-detail');
                    }}
                  />
                ))
              )}
            </motion.div>
          )}

          {currentScreen === 'search' && <SearchScreen onPostClick={(id) => { setSelectedPostId(id); setScrollToComments(false); setCurrentScreen('post-detail'); }} />}
          {currentScreen === 'create' && <CreatePostScreen onComplete={() => setCurrentScreen('home')} />}
          {currentScreen === 'profile' && <ProfileScreen profile={profile} user={user} onPostClick={(id) => { setSelectedPostId(id); setScrollToComments(false); setCurrentScreen('post-detail'); }} />}
          {currentScreen === 'post-detail' && selectedPostId && (
            <PostDetailScreen 
              postId={selectedPostId} 
              onBack={() => setCurrentScreen('home')} 
              isWatered={userWaters.has(selectedPostId)}
              onWater={() => handleWater(selectedPostId)}
              scrollToComments={scrollToComments}
            />
          )}
        </AnimatePresence>
      </main>

      {/* Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 max-w-md mx-auto bg-white border-t border-stone-200 px-8 py-4 flex items-center justify-between z-40">
        <NavButton active={currentScreen === 'home'} onClick={() => setCurrentScreen('home')} icon={<Home />} label="Home" />
        <NavButton active={currentScreen === 'search'} onClick={() => setCurrentScreen('search')} icon={<Search />} label="Explore" />
        <NavButton active={currentScreen === 'create'} onClick={() => setCurrentScreen('create')} icon={<PlusSquare />} label="Post" />
        <NavButton active={currentScreen === 'profile'} onClick={() => setCurrentScreen('profile')} icon={<UserIcon />} label="Profile" />
      </nav>
    </div>
  );
}

// --- Sub-Screens ---

interface PostCardProps {
  key?: React.Key;
  post: GardenPost;
  isWatered: boolean;
  onWater: () => void | Promise<void>;
  onClick: (scroll?: boolean) => void;
}

function PostCard({ post, isWatered, onWater, onClick }: PostCardProps) {
  return (
    <div className="bg-white rounded-2xl overflow-hidden shadow-sm border border-stone-100 group">
      <div className="p-4 flex items-center gap-3">
        <img 
          src={post.authorPhoto || `https://picsum.photos/seed/${post.authorUid}/100`} 
          alt={post.authorName} 
          className="w-10 h-10 rounded-full object-cover bg-stone-100"
          referrerPolicy="no-referrer"
        />
        <div>
          <h3 className="font-semibold text-stone-900 leading-tight">{post.authorName}</h3>
          <p className="text-xs text-stone-400">{formatDate(post.createdAt)}</p>
        </div>
      </div>
      
      <div className="relative aspect-square cursor-pointer overflow-hidden" onClick={() => onClick(false)}>
        <img 
          src={post.images[0] || `https://picsum.photos/seed/${post.id}/800`} 
          alt={post.title} 
          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
          referrerPolicy="no-referrer"
        />
        <div className="absolute top-4 right-4 bg-white/90 backdrop-blur px-2 py-1 rounded-lg text-[10px] font-bold text-emerald-800 uppercase tracking-wider">
          {post.gardenType || 'Garden'}
        </div>
      </div>

      <div className="p-4">
        <div className="flex items-center gap-4 mb-3">
          <button 
            onClick={(e) => { e.stopPropagation(); onWater(); }}
            className={cn(
              "flex items-center gap-1.5 transition-all active:scale-90",
              isWatered ? "text-blue-500" : "text-stone-400 hover:text-blue-400"
            )}
          >
            <Droplets className={cn("w-6 h-6", isWatered && "fill-current")} />
            <span className="font-bold text-sm">{post.waterCount}</span>
          </button>
          <button 
            onClick={(e) => { e.stopPropagation(); onClick(true); }}
            className="flex items-center gap-1.5 text-stone-400 hover:text-emerald-500 transition-colors"
          >
            <MessageCircle className="w-6 h-6" />
            <span className="font-bold text-sm">{post.commentCount}</span>
          </button>
        </div>
        
        <div className="cursor-pointer" onClick={() => onClick(false)}>
          <h2 className="font-bold text-lg text-stone-900 mb-1 leading-tight">{post.title}</h2>
          <p className="text-stone-600 text-sm line-clamp-2">{post.description}</p>
        </div>
      </div>
    </div>
  );
}

function CreatePostScreen({ onComplete }: { onComplete: () => void }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [gardenType, setGardenType] = useState('Backyard');
  const [plantType, setPlantType] = useState('');
  const [growingTips, setGrowingTips] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auth.currentUser) return;
    setSubmitting(true);

    try {
      await addDoc(collection(db, 'posts'), {
        authorUid: auth.currentUser.uid,
        authorName: auth.currentUser.displayName,
        authorPhoto: auth.currentUser.photoURL,
        title,
        description,
        gardenType,
        plantType,
        growingTips,
        images: [imageUrl || `https://picsum.photos/seed/${Date.now()}/800`],
        waterCount: 0,
        commentCount: 0,
        createdAt: serverTimestamp()
      });
      onComplete();
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'posts');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0 }} 
      animate={{ opacity: 1 }} 
      className="space-y-6 pb-12"
    >
      <h2 className="text-2xl font-bold text-emerald-900 font-serif">Share Your Garden</h2>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-1">
          <label className="text-xs font-bold text-stone-400 uppercase tracking-widest">Title</label>
          <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="My Summer Tomatoes" required />
        </div>
        
        <div className="space-y-1">
          <label className="text-xs font-bold text-stone-400 uppercase tracking-widest">Description</label>
          <TextArea value={description} onChange={e => setDescription(e.target.value)} placeholder="Tell us about your garden..." rows={3} required />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <label className="text-xs font-bold text-stone-400 uppercase tracking-widest">Garden Type</label>
            <select 
              value={gardenType} 
              onChange={e => setGardenType(e.target.value)}
              className="w-full px-4 py-3 bg-white border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
            >
              <option>Backyard</option>
              <option>Indoor</option>
              <option>Balcony</option>
              <option>Community</option>
              <option>Rooftop</option>
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-bold text-stone-400 uppercase tracking-widest">Plant Type</label>
            <Input value={plantType} onChange={e => setPlantType(e.target.value)} placeholder="e.g. Succulents" />
          </div>
        </div>

        <div className="space-y-1">
          <label className="text-xs font-bold text-stone-400 uppercase tracking-widest">Growing Tips</label>
          <TextArea value={growingTips} onChange={e => setGrowingTips(e.target.value)} placeholder="Any advice for others?" rows={2} />
        </div>

        <div className="space-y-1">
          <label className="text-xs font-bold text-stone-400 uppercase tracking-widest">Image URL (Optional)</label>
          <Input value={imageUrl} onChange={e => setImageUrl(e.target.value)} placeholder="https://..." />
        </div>

        <Button type="submit" disabled={submitting} className="w-full py-4 text-lg mt-4">
          {submitting ? 'Posting...' : 'Post to Community'}
        </Button>
      </form>
    </motion.div>
  );
}

function PostDetailScreen({ postId, onBack, isWatered, onWater, scrollToComments }: { postId: string, onBack: () => void, isWatered: boolean, onWater: () => void, scrollToComments: boolean }) {
  const [post, setPost] = useState<GardenPost | null>(null);
  const [comments, setComments] = useState<PostComment[]>([]);
  const [commentText, setCommentText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const commentsRef = React.useRef<HTMLDivElement>(null);

  useEffect(() => {
    const postRef = doc(db, 'posts', postId);
    const unsubPost = onSnapshot(postRef, (d) => {
      if (d.exists()) setPost({ id: d.id, ...(d.data() as any) } as GardenPost);
    });

    const commentsQuery = query(collection(db, 'posts', postId, 'comments'), orderBy('createdAt', 'desc'));
    const unsubComments = onSnapshot(commentsQuery, (snapshot) => {
      setComments(snapshot.docs.map(d => ({ id: d.id, ...(d.data() as any) } as PostComment)));
    });

    return () => { unsubPost(); unsubComments(); };
  }, [postId]);

  useEffect(() => {
    if (scrollToComments && post && commentsRef.current) {
      setTimeout(() => {
        commentsRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    }
  }, [scrollToComments, post]);

  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auth.currentUser || !commentText.trim()) return;
    setSubmitting(true);

    try {
      await addDoc(collection(db, 'posts', postId, 'comments'), {
        postId,
        authorUid: auth.currentUser.uid,
        authorName: auth.currentUser.displayName,
        authorPhoto: auth.currentUser.photoURL,
        text: commentText,
        createdAt: serverTimestamp()
      });
      await updateDoc(doc(db, 'posts', postId), { commentCount: increment(1) });
      setCommentText('');
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `posts/${postId}/comments`);
    } finally {
      setSubmitting(false);
    }
  };

  if (!post) return null;

  return (
    <motion.div 
      initial={{ opacity: 0, x: 20 }} 
      animate={{ opacity: 1, x: 0 }} 
      exit={{ opacity: 0, x: -20 }}
      className="fixed inset-0 bg-stone-50 z-50 overflow-y-auto pb-24 max-w-md mx-auto"
    >
      <div className="sticky top-0 z-10 bg-white/80 backdrop-blur-md p-4 flex items-center gap-4 border-b border-stone-100">
        <button onClick={onBack} className="p-2 hover:bg-stone-100 rounded-full transition-colors">
          <ChevronLeft className="w-6 h-6" />
        </button>
        <h2 className="font-bold text-lg truncate">{post.title}</h2>
      </div>

      <img 
        src={post.images[0] || `https://picsum.photos/seed/${post.id}/800`} 
        alt={post.title} 
        className="w-full aspect-square object-cover"
        referrerPolicy="no-referrer"
      />

      <div className="p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <img 
              src={post.authorPhoto || `https://picsum.photos/seed/${post.authorUid}/100`} 
              alt={post.authorName} 
              className="w-12 h-12 rounded-full object-cover"
              referrerPolicy="no-referrer"
            />
            <div>
              <h3 className="font-bold text-stone-900">{post.authorName}</h3>
              <p className="text-xs text-stone-400">{formatDate(post.createdAt)}</p>
            </div>
          </div>
          <button 
            onClick={onWater}
            className={cn(
              "flex flex-col items-center gap-1 transition-all",
              isWatered ? "text-blue-500" : "text-stone-300"
            )}
          >
            <Droplets className={cn("w-8 h-8", isWatered && "fill-current")} />
            <span className="text-xs font-bold">{post.waterCount} Waters</span>
          </button>
        </div>

        <div className="space-y-6 mb-12">
          <div>
            <h4 className="text-xs font-bold text-stone-400 uppercase tracking-widest mb-2">Description</h4>
            <p className="text-stone-700 leading-relaxed">{post.description}</p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="bg-emerald-50 p-3 rounded-xl">
              <h4 className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest mb-1">Garden Type</h4>
              <p className="text-emerald-900 font-semibold">{post.gardenType || 'N/A'}</p>
            </div>
            <div className="bg-emerald-50 p-3 rounded-xl">
              <h4 className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest mb-1">Plant Type</h4>
              <p className="text-emerald-900 font-semibold">{post.plantType || 'N/A'}</p>
            </div>
          </div>

          {post.growingTips && (
            <div className="bg-stone-100 p-4 rounded-2xl border border-stone-200">
              <h4 className="text-xs font-bold text-stone-500 uppercase tracking-widest mb-2 flex items-center gap-2">
                <Leaf className="w-4 h-4" /> Growing Tips
              </h4>
              <p className="text-stone-600 text-sm italic">"{post.growingTips}"</p>
            </div>
          )}
        </div>

        <div className="space-y-4" ref={commentsRef}>
          <h4 className="text-lg font-bold text-stone-900">Comments ({post.commentCount})</h4>
          
          <form onSubmit={handleAddComment} className="flex gap-2">
            <Input 
              value={commentText} 
              onChange={e => setCommentText(e.target.value)} 
              placeholder="Add a comment..." 
              className="py-2"
            />
            <button 
              type="submit" 
              disabled={submitting}
              className="bg-emerald-600 text-white p-3 rounded-xl hover:bg-emerald-700 transition-colors disabled:opacity-50"
            >
              <Send className="w-5 h-5" />
            </button>
          </form>

          <div className="space-y-4 pt-4">
            {comments.map(comment => (
              <div key={comment.id} className="flex gap-3">
                <img 
                  src={comment.authorPhoto || `https://picsum.photos/seed/${comment.authorUid}/100`} 
                  alt={comment.authorName} 
                  className="w-8 h-8 rounded-full object-cover flex-shrink-0"
                  referrerPolicy="no-referrer"
                />
                <div className="bg-white p-3 rounded-2xl rounded-tl-none border border-stone-100 flex-1">
                  <div className="flex justify-between items-start mb-1">
                    <span className="font-bold text-xs text-stone-900">{comment.authorName}</span>
                    <span className="text-[10px] text-stone-400">{formatDate(comment.createdAt)}</span>
                  </div>
                  <p className="text-sm text-stone-600">{comment.text}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function SearchScreen({ onPostClick }: { onPostClick: (id: string) => void }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [results, setResults] = useState<GardenPost[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load initial "Featured" posts or search results
  useEffect(() => {
    const fetchPosts = async () => {
      setLoading(true);
      setError(null);
      try {
        let q;
        if (searchTerm.trim()) {
          // Simple client-side filter for MVP search
          q = query(collection(db, 'posts'), limit(100));
          const snapshot = await getDocs(q);
          const all = snapshot.docs.map(d => ({ id: d.id, ...(d.data() as any) } as GardenPost));
          const filtered = all.filter(p => 
            p.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
            p.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
            p.plantType?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            p.gardenType?.toLowerCase().includes(searchTerm.toLowerCase())
          );
          setResults(filtered);
        } else {
          // Show most watered posts as "Featured"
          q = query(collection(db, 'posts'), orderBy('waterCount', 'desc'), limit(20));
          const snapshot = await getDocs(q);
          setResults(snapshot.docs.map(d => ({ id: d.id, ...(d.data() as any) } as GardenPost)));
        }
      } catch (err) {
        console.error("Search error:", err);
        setError("Could not load posts. Make sure you're connected to the internet.");
      } finally {
        setLoading(false);
      }
    };

    const debounceTimer = setTimeout(fetchPosts, searchTerm ? 300 : 0);
    return () => clearTimeout(debounceTimer);
  }, [searchTerm]);

  return (
    <div className="space-y-6">
      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-stone-400" />
        <Input 
          value={searchTerm} 
          onChange={e => setSearchTerm(e.target.value)} 
          placeholder="Search plants, gardens, tips..." 
          className="pl-12"
        />
      </div>

      {error && (
        <div className="p-4 bg-red-50 text-red-600 rounded-xl text-sm text-center">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-12">
          <motion.div animate={{ rotate: 360 }} transition={{ duration: 2, repeat: Infinity, ease: "linear" }}>
            <Leaf className="w-8 h-8 text-emerald-200" />
          </motion.div>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3">
            {results.map(post => (
              <motion.div 
                key={post.id} 
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                onClick={() => onPostClick(post.id)}
                className="relative aspect-square rounded-2xl overflow-hidden cursor-pointer group shadow-sm border border-stone-100"
              >
                <img 
                  src={post.images[0] || `https://picsum.photos/seed/${post.id}/400`} 
                  alt={post.title} 
                  className="w-full h-full object-cover transition-transform group-hover:scale-110"
                  referrerPolicy="no-referrer"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent p-3 flex flex-col justify-end">
                  <h3 className="text-white text-xs font-bold truncate">{post.title}</h3>
                  <div className="flex items-center gap-1 text-white/70 text-[10px]">
                    <Droplets className="w-3 h-3" />
                    <span>{post.waterCount}</span>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>

          {results.length === 0 && !loading && (
            <div className="text-center py-12 opacity-50">
              <p>No gardens found matching your search.</p>
            </div>
          )}
        </>
      )}

      {!searchTerm && (
        <div className="space-y-4">
          <h3 className="font-bold text-stone-900">Popular Categories</h3>
          <div className="flex flex-wrap gap-2">
            {['Indoor', 'Succulents', 'Tomatoes', 'Balcony', 'Herbs', 'Organic'].map(cat => (
              <button 
                key={cat} 
                onClick={() => setSearchTerm(cat)}
                className="px-4 py-2 bg-emerald-50 text-emerald-700 rounded-full text-sm font-medium hover:bg-emerald-100 transition-colors"
              >
                {cat}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ProfileScreen({ profile, user, onPostClick }: { profile: UserProfile | null, user: User, onPostClick: (id: string) => void }) {
  const [userPosts, setUserPosts] = useState<GardenPost[]>([]);

  useEffect(() => {
    const q = query(collection(db, 'posts'), where('authorUid', '==', user.uid), orderBy('createdAt', 'desc'));
    return onSnapshot(q, (snapshot) => {
      setUserPosts(snapshot.docs.map(d => ({ id: d.id, ...(d.data() as any) } as GardenPost)));
    });
  }, [user.uid]);

  if (!profile) return null;

  return (
    <div className="space-y-8">
      <div className="flex flex-col items-center text-center">
        <div className="relative mb-4">
          <img 
            src={profile.photoURL || `https://picsum.photos/seed/${profile.uid}/200`} 
            alt={profile.displayName} 
            className="w-24 h-24 rounded-full object-cover border-4 border-white shadow-md"
            referrerPolicy="no-referrer"
          />
          <button className="absolute bottom-0 right-0 bg-emerald-600 text-white p-2 rounded-full shadow-lg">
            <Camera className="w-4 h-4" />
          </button>
        </div>
        <h2 className="text-2xl font-bold text-stone-900">{profile.displayName}</h2>
        <p className="text-stone-500 text-sm mb-4">{profile.bio}</p>
        
        <div className="flex gap-8 border-y border-stone-100 w-full py-4 justify-center">
          <div className="text-center">
            <span className="block font-bold text-stone-900">{userPosts.length}</span>
            <span className="text-[10px] text-stone-400 uppercase tracking-widest">Posts</span>
          </div>
          <div className="text-center">
            <span className="block font-bold text-stone-900">{profile.followersCount || 0}</span>
            <span className="text-[10px] text-stone-400 uppercase tracking-widest">Followers</span>
          </div>
          <div className="text-center">
            <span className="block font-bold text-stone-900">{profile.followingCount || 0}</span>
            <span className="text-[10px] text-stone-400 uppercase tracking-widest">Following</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-1">
        {userPosts.map(post => (
          <div 
            key={post.id} 
            onClick={() => onPostClick(post.id)}
            className="aspect-square cursor-pointer overflow-hidden bg-stone-200"
          >
            <img 
              src={post.images[0] || `https://picsum.photos/seed/${post.id}/400`} 
              alt={post.title} 
              className="w-full h-full object-cover hover:opacity-80 transition-opacity"
              referrerPolicy="no-referrer"
            />
          </div>
        ))}
      </div>
    </div>
  );
}

function NavButton({ active, onClick, icon, label }: { active: boolean, onClick: () => void, icon: React.ReactNode, label: string }) {
  return (
    <button 
      onClick={onClick}
      className={cn(
        "flex flex-col items-center gap-1 transition-all",
        active ? "text-emerald-600 scale-110" : "text-stone-400 hover:text-stone-600"
      )}
    >
      {React.cloneElement(icon as React.ReactElement, { className: cn("w-6 h-6", active && "fill-emerald-600/10") })}
      <span className="text-[10px] font-bold uppercase tracking-tighter">{label}</span>
    </button>
  );
}
