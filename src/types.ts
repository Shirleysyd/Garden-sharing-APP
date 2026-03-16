import { Timestamp } from 'firebase/firestore';

export interface UserProfile {
  uid: string;
  displayName: string;
  photoURL?: string;
  bio?: string;
  followersCount?: number;
  followingCount?: number;
  role?: 'admin' | 'user';
}

export interface GardenPost {
  id: string;
  authorUid: string;
  authorName: string;
  authorPhoto?: string;
  title: string;
  description: string;
  gardenType?: string;
  plantType?: string;
  growingTips?: string;
  images: string[];
  waterCount: number;
  commentCount: number;
  createdAt: Timestamp;
}

export interface PostComment {
  id: string;
  postId: string;
  authorUid: string;
  authorName: string;
  authorPhoto?: string;
  text: string;
  createdAt: Timestamp;
}

export interface WaterInteraction {
  userId: string;
  postId: string;
  createdAt: Timestamp;
}

export interface FollowRelationship {
  followerId: string;
  followingId: string;
  createdAt: Timestamp;
}
