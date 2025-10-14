import React from "react";
import { Linking, SafeAreaView, StyleSheet, Text, TouchableOpacity, View } from "react-native";

const WEB_APP_URL = "https://joslyn.ai";
const CONTACT_EMAIL = "hello@joslyn.ai";

export default function App() {
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.heading}>Joslyn AI (Mobile)</Text>
        <Text style={styles.body}>
          Our mobile experience is in active design. The full web workspace is production-ready today while we gather feedback for the native app.
        </Text>
        <TouchableOpacity style={styles.button} onPress={() => Linking.openURL(WEB_APP_URL)}>
          <Text style={styles.buttonText}>Open Web App</Text>
        </TouchableOpacity>
        <Text style={styles.footer}>
          Want to join the mobile beta? Email {CONTACT_EMAIL} and we&apos;ll keep you posted.
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f8fafc",
    justifyContent: "center",
    padding: 24,
  },
  card: {
    borderRadius: 24,
    backgroundColor: "#fff",
    padding: 24,
    shadowColor: "#0f172a",
    shadowOpacity: 0.08,
    shadowOffset: { width: 0, height: 10 },
    shadowRadius: 20,
    elevation: 5,
  },
  heading: {
    fontSize: 22,
    fontWeight: "700",
    color: "#0f172a",
  },
  body: {
    marginTop: 12,
    fontSize: 15,
    lineHeight: 22,
    color: "#475569",
  },
  button: {
    marginTop: 20,
    paddingVertical: 12,
    borderRadius: 999,
    backgroundColor: "#4338ca",
    alignItems: "center",
  },
  buttonText: {
    color: "#fff",
    fontWeight: "600",
    fontSize: 15,
  },
  footer: {
    marginTop: 16,
    fontSize: 13,
    lineHeight: 20,
    color: "#475569",
  },
});

