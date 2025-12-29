import { View, Text, Pressable } from 'react-native';
import { Link } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Leaf } from 'lucide-react-native';

export default function WelcomeScreen() {
  return (
    <SafeAreaView className="flex-1 bg-background">
      <View className="flex-1 px-6">
        {/* Hero Section */}
        <View className="flex-1 items-center justify-center">
          {/* Logo */}
          <View className="mb-8 items-center">
            <View className="w-24 h-24 rounded-full bg-primary/20 items-center justify-center mb-6">
              <Leaf size={48} color="#10B981" strokeWidth={1.5} />
            </View>
            <Text className="text-5xl font-bold text-text-primary tracking-tight">Cannect</Text>
            <Text className="text-lg text-text-secondary mt-2">Connect. Share. Grow.</Text>
          </View>

          {/* Tagline */}
          <Text className="text-center text-text-secondary text-base px-8 leading-6">
            Join a community where your voice matters. Share ideas, discover stories, and build
            meaningful connections.
          </Text>
        </View>

        {/* CTA Buttons */}
        <View className="pb-8 gap-4">
          {/* Create Account */}
          <Link href="/(auth)/register" asChild>
            <Pressable>
              <LinearGradient
                colors={['#10B981', '#059669']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                className="py-4 px-8 rounded-2xl"
              >
                <Text className="text-white text-center text-lg font-semibold">Create Account</Text>
              </LinearGradient>
            </Pressable>
          </Link>

          {/* Sign In */}
          <Link href="/(auth)/login" asChild>
            <Pressable className="py-4 px-8 rounded-2xl border border-border">
              <Text className="text-text-primary text-center text-lg font-semibold">Sign In</Text>
            </Pressable>
          </Link>

          {/* Terms */}
          <Text className="text-center text-text-muted text-sm">
            By continuing, you agree to our <Text className="text-primary">Terms of Service</Text>{' '}
            and <Text className="text-primary">Privacy Policy</Text>
          </Text>
        </View>
      </View>
    </SafeAreaView>
  );
}
