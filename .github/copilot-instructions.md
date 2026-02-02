# Business Product Management System

## Project Overview
A user-friendly web application for businesses to manage their products with features like:
- Product listing with images, prices, and descriptions
- Add/Edit/Delete products
- Image upload capability
- Search and filter products
- Clean modern UI with Tailwind CSS

## Tech Stack
- **Framework**: Next.js 14 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **Database**: SQLite with Prisma ORM
- **UI Components**: Custom components with modern design

## Project Structure
```
├── app/                    # Next.js App Router pages
│   ├── page.tsx           # Dashboard/Home page
│   ├── products/          # Product management pages
│   └── api/               # API routes
├── components/            # Reusable UI components
├── lib/                   # Utility functions and database
├── prisma/               # Database schema
└── public/               # Static assets
```

## Commands
- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npx prisma studio` - Open database GUI
