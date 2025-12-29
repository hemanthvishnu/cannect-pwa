import { Pressable, Text, ActivityIndicator, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import type { ReactNode } from 'react';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps {
  children: ReactNode;
  onPress?: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  disabled?: boolean;
  loading?: boolean;
  icon?: ReactNode;
  fullWidth?: boolean;
}

export function Button({
  children,
  onPress,
  variant = 'primary',
  size = 'md',
  disabled = false,
  loading = false,
  icon,
  fullWidth = false,
}: ButtonProps) {
  const sizeClasses = {
    sm: 'py-2 px-4',
    md: 'py-3 px-6',
    lg: 'py-4 px-8',
  };

  const textSizes = {
    sm: 'text-sm',
    md: 'text-base',
    lg: 'text-lg',
  };

  const isDisabled = disabled || loading;

  if (variant === 'primary') {
    return (
      <Pressable onPress={onPress} disabled={isDisabled} className={fullWidth ? 'w-full' : ''}>
        <LinearGradient
          colors={isDisabled ? ['#065F46', '#064E3B'] : ['#10B981', '#059669']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          className={`rounded-2xl flex-row items-center justify-center gap-2 ${sizeClasses[size]}`}
        >
          {loading ? (
            <ActivityIndicator size="small" color="#FAFAFA" />
          ) : (
            <>
              {icon}
              <Text className={`text-white font-semibold ${textSizes[size]}`}>{children}</Text>
            </>
          )}
        </LinearGradient>
      </Pressable>
    );
  }

  const variantClasses = {
    secondary: 'bg-surface-elevated border border-border',
    ghost: 'bg-transparent',
    danger: 'bg-accent-error/20 border border-accent-error/50',
  };

  const textColors = {
    secondary: 'text-text-primary',
    ghost: 'text-primary',
    danger: 'text-accent-error',
  };

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      className={`rounded-2xl flex-row items-center justify-center gap-2 ${sizeClasses[size]} ${variantClasses[variant]} ${fullWidth ? 'w-full' : ''} ${isDisabled ? 'opacity-50' : ''}`}
    >
      {loading ? (
        <ActivityIndicator size="small" color="#10B981" />
      ) : (
        <>
          {icon}
          <Text className={`font-semibold ${textSizes[size]} ${textColors[variant]}`}>
            {children}
          </Text>
        </>
      )}
    </Pressable>
  );
}
