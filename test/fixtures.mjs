// A structurally valid config, cloned per call so tests can mutate freely.
export function validConfig() {
  return structuredClone({
    url: { CARD_URL: 'https://idalhamed.github.io/card' },
    apple: {
      passTypeIdentifier: 'pass.com.alihamed.card',
      teamIdentifier: 'ABCDE12345',
      organizationName: 'Ali Hamed',
      serialNumber: 'ali-hamed-001',
      description: 'Ali Hamed — iOS Developer',
    },
    content: {
      name: 'ALI HAMED',
      fullName: 'Ali Hamed',
      role: 'iOS Developer',
      roleSecondary: 'SOFTWARE ENGINEER',
      technologies: 'Swift · SwiftUI · UIKit',
      message: 'Building mobile products with a focus on performance & user experience.',
      cta: "Got a product to build? Let's make it happen.",
      footer: '© 2026 Ali Hamed',
      taglineWallet: 'Building mobile products, end to end.',
      taglinePage: 'I turn ideas into high-quality mobile products people love.',
      taglineCardFront: 'BUILDING MOBILE PRODUCTS FROM IDEA TO LAUNCH',
      expertise: [
        { icon: 'smartphone', label: 'iOS Development' },
        { icon: 'layers', label: 'App Architecture' },
        { icon: 'gauge', label: 'Performance Optimization' },
        { icon: 'app-window', label: 'UI/UX Implementation' },
        { icon: 'cloud-upload', label: 'APIs & Integrations' },
        { icon: 'lightbulb', label: 'Problem Solving' },
        { icon: 'code-xml', label: 'Clean Code' },
        { icon: 'shield-check', label: 'Testing' },
        { icon: 'users', label: 'Agile & Collaboration' },
      ],
    },
    contacts: {
      linkedin: 'https://www.linkedin.com/in/idalhamed/',
      github: 'https://github.com/idAlhamed',
      whatsapp: 'https://wa.me/966554248646',
      phone: '+966554248646',
      phoneDisplay: '+966 55 424 8646',
      email: 'officialalhamed@gmail.com',
      location: 'Riyadh, Saudi Arabia',
    },
  });
}
