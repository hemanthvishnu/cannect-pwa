import { useState } from "react";
import {
  View, Text, TextInput, Pressable, KeyboardAvoidingView,
  Platform, ScrollView, ActivityIndicator,
} from "react-native";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { ArrowLeft, Key, Lock, Eye, EyeOff, CheckCircle } from "lucide-react-native";
import * as atproto from "@/lib/atproto/agent";

export default function ResetPasswordScreen() {
  const [token, setToken] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleResetPassword = async () => {
    setError(null);
    
    if (!token) {
      setError("Please enter the reset code from your email");
      return;
    }
    
    if (!password) {
      setError("Please enter a new password");
      return;
    }
    
    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }
    
    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    setIsLoading(true);
    try {
      await atproto.resetPassword(token.trim(), password);
      setSuccess(true);
    } catch (err: any) {
      if (err.message?.includes('expired')) {
        setError("Reset code has expired. Please request a new one.");
      } else if (err.message?.includes('invalid')) {
        setError("Invalid reset code. Please check and try again.");
      } else {
        setError(err.message || "Failed to reset password. Please try again.");
      }
    } finally {
      setIsLoading(false);
    }
  };

  if (success) {
    return (
      <SafeAreaView className="flex-1 bg-background">
        <View className="flex-1 px-6 items-center justify-center">
          <View className="w-20 h-20 rounded-full bg-primary/20 items-center justify-center mb-6">
            <CheckCircle size={40} color="#10B981" />
          </View>
          <Text className="text-2xl font-bold text-text-primary mb-4 text-center">Password Reset!</Text>
          <Text className="text-text-secondary text-center mb-8 text-base leading-6">
            Your password has been successfully reset. You can now sign in with your new password.
          </Text>
          <Pressable 
            onPress={() => router.replace("/(auth)/login")}
            className="py-4 px-8 rounded-2xl bg-primary"
          >
            <Text className="text-white text-center font-semibold text-lg">Sign In</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-background">
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} className="flex-1">
        <ScrollView className="flex-1" contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled">
          <View className="px-6 pt-4">
            <Pressable onPress={() => router.back()} className="w-10 h-10 rounded-full bg-surface-elevated items-center justify-center">
              <ArrowLeft size={20} color="#FAFAFA" />
            </Pressable>
          </View>
          <View className="flex-1 px-6 pt-8">
            <Text className="text-3xl font-bold text-text-primary mb-2">Reset password</Text>
            <Text className="text-text-secondary mb-8 text-base">
              Enter the reset code from your email and choose a new password.
            </Text>
            
            {error && (
              <View className="bg-accent-error/20 border border-accent-error/50 rounded-xl p-4 mb-6">
                <Text className="text-accent-error text-center">{error}</Text>
              </View>
            )}
            
            <View className="gap-4">
              {/* Reset Code */}
              <View>
                <Text className="text-text-secondary text-sm mb-2">Reset Code</Text>
                <View className="bg-surface-elevated border border-border rounded-xl flex-row items-center px-4">
                  <Key size={20} color="#6B6B6B" />
                  <TextInput 
                    placeholder="Enter code from email" 
                    placeholderTextColor="#6B6B6B" 
                    value={token}
                    onChangeText={setToken} 
                    autoCapitalize="none"
                    autoCorrect={false}
                    className="flex-1 py-4 px-3 text-text-primary text-base font-mono" 
                  />
                </View>
              </View>
              
              {/* New Password */}
              <View>
                <Text className="text-text-secondary text-sm mb-2">New Password</Text>
                <View className="bg-surface-elevated border border-border rounded-xl flex-row items-center px-4">
                  <Lock size={20} color="#6B6B6B" />
                  <TextInput 
                    placeholder="At least 8 characters" 
                    placeholderTextColor="#6B6B6B" 
                    value={password}
                    onChangeText={setPassword} 
                    secureTextEntry={!showPassword} 
                    className="flex-1 py-4 px-3 text-text-primary text-base" 
                  />
                  <Pressable onPress={() => setShowPassword(!showPassword)}>
                    {showPassword ? <EyeOff size={20} color="#6B6B6B" /> : <Eye size={20} color="#6B6B6B" />}
                  </Pressable>
                </View>
              </View>
              
              {/* Confirm Password */}
              <View>
                <Text className="text-text-secondary text-sm mb-2">Confirm Password</Text>
                <View className="bg-surface-elevated border border-border rounded-xl flex-row items-center px-4">
                  <Lock size={20} color="#6B6B6B" />
                  <TextInput 
                    placeholder="Re-enter password" 
                    placeholderTextColor="#6B6B6B" 
                    value={confirmPassword}
                    onChangeText={setConfirmPassword} 
                    secureTextEntry={!showPassword} 
                    className="flex-1 py-4 px-3 text-text-primary text-base" 
                  />
                </View>
              </View>
            </View>
          </View>
          
          <View className="px-6 pb-8">
            <Pressable 
              onPress={handleResetPassword} 
              disabled={isLoading} 
              className={`py-4 rounded-2xl bg-primary ${isLoading ? 'opacity-50' : ''}`}
            >
              {isLoading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text className="text-white text-center font-semibold text-lg">Reset Password</Text>
              )}
            </Pressable>
            
            <Pressable onPress={() => router.replace("/(auth)/forgot-password" as any)} className="mt-4 py-3">
              <Text className="text-text-secondary text-center">Need a new reset code?</Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
