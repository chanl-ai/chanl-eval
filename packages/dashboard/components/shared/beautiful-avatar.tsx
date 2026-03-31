"use client";

import React from "react";
import { User } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  getPlatformGradient,
  getInitials,
  type Platform,
} from "@/lib/utils/avatar-gradients";
import Image from "next/image";

export interface BeautifulAvatarProps {
  /**
   * Image URL for the avatar (optional)
   */
  imageUrl?: string;

  /**
   * Name for initials fallback
   */
  name: string;

  /**
   * Platform/credential for gradient background
   */
  platform?: Platform;

  /**
   * Size of the avatar
   */
  size?: "xs" | "sm" | "md" | "lg" | "xl";

  /**
   * Custom className
   */
  className?: string;

  /**
   * Show icon instead of initials when no image
   */
  showIcon?: boolean;

  /**
   * Custom icon component
   */
  icon?: React.ComponentType<{ className?: string }>;
}

const sizeClasses = {
  xs: "h-5 w-5 text-[10px]",
  sm: "h-8 w-8 text-xs",
  md: "h-10 w-10 text-sm",
  lg: "h-12 w-12 text-base",
  xl: "h-16 w-16 text-lg",
};

const iconSizeClasses = {
  xs: "h-3 w-3",
  sm: "h-4 w-4",
  md: "h-5 w-5",
  lg: "h-6 w-6",
  xl: "h-8 w-8",
};

/**
 * BeautifulAvatar - Enhanced avatar component with platform-based gradients
 *
 * Features:
 * - Shows image if available
 * - Falls back to gradient background based on platform (from getting-started page)
 * - Rounded rectangle shape (not circular)
 * - Shows initials or icon as fallback
 */
export function BeautifulAvatar({
  imageUrl,
  name,
  platform,
  size = "md",
  className,
  showIcon = false,
  icon: Icon = User,
}: BeautifulAvatarProps) {
  const initials = getInitials(name);
  const gradientBg = platform
    ? `bg-gradient-to-br ${getPlatformGradient(platform, name)}`
    : "bg-muted";

  return (
    <div
      className={cn(
        sizeClasses[size],
        "relative rounded-lg overflow-hidden flex-shrink-0",
        className,
      )}
    >
      {imageUrl ? (
        <Image
          src={imageUrl}
          alt={name}
          fill
          className="object-cover rounded-lg"
        />
      ) : (
        <div
          className={cn(
            gradientBg,
            "text-foreground font-semibold rounded-lg w-full h-full flex items-center justify-center",
          )}
        >
          {showIcon ? <Icon className={iconSizeClasses[size]} /> : initials}
        </div>
      )}
    </div>
  );
}
