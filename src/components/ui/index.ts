/* ─────────────────────────────────────────────────────────────────────────────
   Feasy UI Component Library — barrel export
   Phase 7: Design System Consolidated
───────────────────────────────────────────────────────────────────────────── */

// ── Primitives ──────────────────────────────────────────────────────────────
export { Button } from './Button';
export type { ButtonProps } from './Button';

export { Input, Select, Checkbox, RadioGroup, TextareaField } from './Input';
export type { InputProps, SelectProps, CheckboxProps, RadioGroupProps, TextareaFieldProps } from './Input';

export { Badge, CategoryBadge } from './Badge';
export type { JobState } from '@/lib/jobs/states';

export { Card } from './Card';
export { Label } from './Label';
export { Textarea } from './Textarea';
export { Pill } from './Pill';
export { Metric, MetricGrid } from './Metric';
export { Toggle } from './Toggle';
export { Tabs } from './Tabs';
export { Timeline, StateRail } from './Timeline';

// ── Feedback / Status ───────────────────────────────────────────────────────
export { EmptyState, EmptyStateContent, LoadingState, SkeletonRows } from './EmptyState';
export { ErrorState, NetworkErrorState, NotFoundState, PermissionErrorState } from './ErrorState';
export { SuccessState } from './SuccessState';
export { LoadingSpinner } from './LoadingSpinner';
export { Skeleton } from './Skeleton';
export { Toast } from './Toast';
export { FormError } from './FormError';
export { FormInput } from './FormInput';
export { FormLabel } from './FormLabel';

// ── Overlays / Dialogs ──────────────────────────────────────────────────────
export { ConfirmationModal, ActionModal, SimpleModal } from './Modal';
export { SideOver } from './SideOver';

// ── Layout / Navigation ─────────────────────────────────────────────────────
export { DashboardHeader, SectionHeader, AppTopBar } from './Header';
export { UserMenu } from './UserMenu';
export { Navbar } from './Navbar';
export { Dropdown } from './Dropdown';
export type { UserMenuUser, UserMenuItem } from './UserMenu';

// ── Data Display ────────────────────────────────────────────────────────────
export { Table } from './Table';

// ── Animation / Utilities ───────────────────────────────────────────────────
export { AnimationProvider } from './AnimationProvider';
export { AnimatedCounter } from './AnimatedCounter';
export { ToastProvider, useToast } from './ToastProvider';
export { ConfirmDialog } from './ConfirmDialog';
