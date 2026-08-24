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
      technologies: 'Swift · SwiftUI · UIKit',
      message: 'Building mobile products with a focus on performance & user experience.',
      cta: "Got a product to build? Let's make it happen.",
      footer: '© 2026 Ali Hamed',
    },
    contacts: {
      linkedin: 'https://www.linkedin.com/in/idalhamed/',
      github: 'https://github.com/idAlhamed',
      whatsapp: 'https://wa.me/966554248646',
      phone: '+966554248646',
      email: 'officialalhamed@gmail.com',
    },
  });
}
