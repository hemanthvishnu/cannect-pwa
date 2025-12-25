import { useState } from "react";
import {
  View, Text, TextInput, Pressable, KeyboardAvoidingView,
  Platform, ScrollView, ActivityIndicator,
} from "react-native";
import { Link, router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { ArrowLeft, Mail, CheckCircle } from "lucide-react-native";
import * as atproto from "@/lib/atproto/agent";

export default function ForgotPasswordScreen() {
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleRequestReset = async () => {
    setError(null);
    if (!email) {
      setError("Please enter your email address");
      return;
    }

    setIsLoading(true);
    try {
      await atproto.requestPasswordReset(email);
      setSuccess(true);
    } catch (err: any) {
      // AT Protocol may not return error for non-existent emails (security)
      // So we show success anyway to prevent email enumeration
      if (err.message?.includes('rate limit')) {
        setError("Too many requests. Please wait a few minutes and try again.");
      } else {
        // Show success even on error to prevent email enumeration
        setSuccess(true);
      }
    } finally {
      setIsLoading(false);
    }
  };

  if (success) {
    return (
      <SafeAreaView className="flex-1 bg-background">
        <View className="px-6 pt-4">
          <Pressable onPress={() => router.back()} className="w-10 h-10 rounded-full bg-surface-elevated items-center justify-center">
            <ArrowLeft size={20} color="#FAFAFA" />
          </Pressable>
        </View>
        <View className="flex-1 px-6 pt-8 items-center justify-center">
          <View className="w-20 h-20 rounded-full bg-primary/20 items-center justify-center mb-6">
            <CheckCircle size={40} color="#10B981" />
          </View>
          <Text className="text-2xl font-bold text-text-primary mb-4 text-center">Check your email</Text>
          <Text className="text-text-secondary text-center mb-8 text-base leading-6">
            If an account exists for {email}, you'll receive a password reset code. Check your inbox and spam folder.
          </Text>
          <Pressable 
            onPress={() => router.push("/(auth)/reset-password" as any)} 
            className="py-4 px-8 rounded-2xl bg-primary"
          >
            <Text className="text-white text-center font-semibold text-lg">Enter Reset Code</Text>
          </Pressable>
          <Pressable onPress={() => router.replace("/(auth)/login")} className="mt-4 py-3">
            <Text className="text-text-secondary text-center">Back to Login</Text>
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
            <Text className="text-3xl font-bold text-text-primary mb-2">Forgot password?</Text>
            <Text className="text-text-secondary mb-8 text-base">
              Enter your email address and we'll send you a reset code.
            </Text>
            
            {error && (
              <View className="bg-accent-error/20 border border-accent-error/50 rounded-xl p-4 mb-6">
                <Text className="text-accent-error text-center">{error}</Text>
              </View>
            )}
            
            <View className="gap-4">
              <View className="bg-surface-elevated border border-border rounded-xl flex-row items-center px-4">
                <Mail size={20} color="#6B6B6B" />
                <TextInput 
                  placeholder="Email address" 
                  placeholderTextColor="#6B6B6B" 
                  value={email}
                  onChangeText={setEmail} 
                  autoCapitalize="none" 
                  keyboardType="email-address"
                  autoComplete="email"
                  className="flex-1 py-4 px-3 text-text-primary text-base" 
                />
              </View>
              <Text className="text-text-tertiary text-sm">
                We'll send a reset code to this email address.
              </Text>
            </View>
          </View>
          
          <View className="px-6 pb-8">
            <Pressable 
              onPress={handleRequestReset} 
              disabled={isLoading} 
              className={`py-4 rounded-2xl bg-primary ${isLoading ? 'opacity-50' : ''}`}
            >
              {isLoading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text className="text-white text-center font-semibold text-lg">Send Reset Code</Text>
              )}
            </Pressable>
            
            <View className="flex-row justify-center mt-6">
              <Text className="text-text-secondary">Remember your password? </Text>
              <Link href="/(auth)/login" asChild>
                <Pressable>
                  <Text className="text-primary font-semibold">Sign In</Text>
                </Pressable>
              </Link>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
