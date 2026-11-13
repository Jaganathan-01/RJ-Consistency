import {
  BookOpen,
  Brain,
  Clock,
  Code2,
  Compass,
  Dumbbell,
  Flame,
  Heart,
  Mic,
  Music,
  PenTool,
  Target,
} from 'lucide-react';
import type { ComponentType } from 'react';

export const COMMITMENT_ICONS: Record<string, ComponentType<{ className?: string }>> = {
  Brain,
  Code2,
  Mic,
  BookOpen,
  Dumbbell,
  Target,
  Heart,
  Flame,
  Clock,
  Compass,
  PenTool,
  Music,
};

export const ICON_OPTIONS = Object.keys(COMMITMENT_ICONS);

export const COLOR_OPTIONS = [
  '#10B981', // Emerald
  '#3B82F6', // Cobalt
  '#8B5CF6', // Violet
  '#F59E0B', // Amber
  '#EF4444', // Crimson
  '#06B6D4', // Cyan
  '#EC4899', // Rose
  '#64748B', // Slate
] as const;

export function CommitmentIcon({
  name,
  className = 'h-5 w-5',
}: {
  name: string;
  className?: string;
}) {
  const Icon = COMMITMENT_ICONS[name] ?? Target;
  return <Icon className={className} />;
}
