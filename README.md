# Karigo Command Center

Absolutely. Since the backend, APIs, database, authentication, Google Maps, WebSockets, offline sync, etc. are not being built yet, I would treat this phase as an Enterprise Frontend Prototype / UX Specification.

The prototype should look and behave like a real production TMS, but use mock data and simulated interactions underneath. That will let Petroline review the complete operational experience before backend integration.

KARIGO TRANSPORT MANAGEMENT SYSTEM

Enterprise Frontend Prototype — PRD & BRD

Project: Karigo Transport Management System (TMS)
Initial Client: Petroline Transport
Executing Agency: Forah Technology
Product Strategist / CTO: Okwudili Fortune
Document Version: Frontend Prototype v1.0
Current Phase: Enterprise Web Frontend Prototype
Status: Prototype / Pre-Backend Integration

1. Executive Summary

Karigo is an enterprise-grade Transport Management System designed to digitize and centralize heavy transport operations.

The first deployment client is Petroline Transport, while the product architecture and user experience must be designed from the beginning as a scalable multi-tenant B2B SaaS platform.

For this phase, development is restricted to the frontend prototype.

The objective is to create a highly polished, enterprise-level Web Command Center that visually and functionally demonstrates the complete Karigo operating environment before backend engineering begins.

The prototype will use mock data, simulated workflows, placeholder integrations and frontend state management.

No production database, payment processing, real-time infrastructure, GPS hardware, authentication backend or external API dependency is required at this stage.

2. Prototype Objective

The frontend prototype must answer one primary question:

"If Karigo were already operational, what would the complete digital control environment look and feel like for Petroline Transport?"

The prototype must therefore demonstrate:

Executive visibility

Fleet control

Dispatch operations

Driver management

Truck management

Fuel management

Engineering/workshop operations

Inventory

Accounts and approvals

Gate/security operations

Trip tracking

Messaging

Notifications

Reports

Audit visibility

User and role management

Tenant/company configuration

The experience must feel like a real enterprise product, not a collection of disconnected demo screens.

3. Design Direction

3.1 Product Character

Karigo should communicate:

Enterprise

Operational control

Reliability

Security

Precision

Accountability

Fleet intelligence

Professionalism

The interface should resemble the quality level expected from modern enterprise products used by logistics, oil & gas, construction, aviation and large-scale transport organizations.

4. Frontend Architecture

The prototype should use a consistent application shell.

Global Layout

Left Sidebar

Primary navigation:

Dashboard

Fleet & Dispatch

Trips

Fuel

Engineering

Inventory

Drivers & HR

Accounts

Gate & Security

Messages

Reports

Notifications

Audit Logs

Administration

The sidebar should support:

Expanded mode

Collapsed/icon mode

Active module highlighting

Module notification badges

Role-based visibility

5. Global Header

The top navigation should contain:

Left

Sidebar toggle

Current workspace/company

Breadcrumb

Center/Optional

Global search

Search should eventually support:

Driver

Truck

Trip

Booking

Requisition

Expense

Employee

Inventory item

Right

Notifications

Messages

Help

User profile

Role indicator

Workspace switcher

Example:

Petroline Transport

Operations Admin
Online

6. Dashboard — Command Center

The dashboard is the primary landing screen.

It should immediately communicate the current operational state of the organization.

Executive KPI Cards

Display:

Active Trips

Example:

42

+8.4% today

Available Trucks

68

12 currently under maintenance

Available Drivers

74

6 unavailable

Pending Approvals

18

₦4.82M total

Fuel Allocation

8,420 L

Today

Maintenance Alerts

7

3 critical

7. Live Operations Map

The dashboard should contain a large interactive-looking map area.

For the prototype, use simulated map data.

Map should display:

Active trucks

Current trip locations

Pickup locations

Drop-off locations

Route lines

Vehicle status

Critical alerts

Example vehicle statuses:

En Route

Loaded

Offloading

Returning

Delayed

Stopped

Selecting a truck opens a compact vehicle information panel.

8. Operations Activity Feed

Display recent system activity.

Examples:

TRK-104
Trip status changed to Loaded

DRV-028
Driver assigned to Trip #TRP-00842

REQ-00281
Fuel requisition approved

WO-00931
Workshop repair order created

EXP-00481
Toll expense submitted

Every activity should show:

Timestamp

User

Module

Action

Reference ID

9. Critical Alerts

Dashboard alert panel:

Critical

Truck TRK-071 requires immediate maintenance.

Warning

Driver license expires in 14 days.

Approval

₦840,000 operational expense requires management approval.

System

12 records waiting for synchronization.

10. Fleet & Dispatch Module

The Fleet & Dispatch module is the primary operational workspace.

Fleet Overview

Display:

Total trucks

Available

Assigned

In transit

Maintenance

Out of service

Table columns:

TruckRegistrationTypeDriverStatusLocationTripAction

11. Create Dispatch

The prototype should include a full enterprise dispatch form.

Step 1 — Trip Information

Fields:

Trip ID

Customer

Cargo

Pickup location

Drop-off location

Scheduled date

Priority

Step 2 — Vehicle

Truck selector.

Statuses should determine availability.

Example:

TRK-102 — Available

TRK-103 — Maintenance

TRK-104 — Assigned

Only available trucks should appear as selectable.

Step 3 — Driver

Driver selector.

Display:

Driver name

Driver ID

License status

Current status

Previous trip

Compliance indicator

Step 4 — Route

Pickup and destination inputs.

Prototype should simulate:

Estimated Distance: 387 km

Estimated Duration: 6h 20m

Distance should visually appear as a locked system-generated value.

Step 5 — Review

Display complete dispatch summary.

Button:

Create Dispatch

12. Trip Details

Every trip receives a dedicated Trip Details page.

Header:

TRP-00842

Lagos → Abuja

EN ROUTE

Display:

Truck

Driver

Cargo

Distance

ETA

Start time

Current status

Trip progress

13. Trip Timeline

Example:

✓ Dispatch Created
✓ Driver Assigned
✓ Truck Departed
✓ Pickup Completed
● En Route
○ Offloading
○ Returning
○ Trip Completed

The timeline must be highly visual.

14. Trip Context Chat

Every active trip should have a communication panel.

Example:

TRP-00842 Operations Thread

Participants:

Dispatcher

Driver

Fleet Manager

Accounts

Management

Messages should visually demonstrate real-time communication.

15. Fuel Management

Dashboard cards:

Today's fuel issued

Monthly fuel consumption

Average Km/L

Pending requisitions

Fuel variance

Fuel Requisition

Fields:

Requisition ID

Trip

Truck

Driver

Required litres

Approved litres

Expected consumption

Standard efficiency

Current odometer

Display:

Expected Efficiency

3.2 Km/L

Expected Fuel

121 L

16. Engineering & Workshop

Engineering dashboard:

KPI Cards

Open defects

Active repairs

Trucks awaiting parts

Critical repairs

Completed repairs

Workshop Queue

Table:

Work OrderTruckDefectPriorityMechanicStatus

Statuses:

Reported

Diagnosing

Awaiting Parts

Repairing

Testing

Completed

17. Defect Reporting

Frontend prototype should demonstrate driver defect submission.

Screen contains:

Report Vehicle Defect

Fields:

Truck

Defect category

Description

Severity

Photo upload

Location

Date/time

Upload area:

Drag photo here or Upload Image

After submission:

Defect Ticket ENG-00482 Created

18. Inventory / Workshop Store

Inventory dashboard:

Total stock items

Low stock

Out of stock

Pending requisitions

Inventory value

Inventory table:

ItemSKUCategoryStockReorder LevelStatus

Example:

Brake Pad
SKU: BRK-042
Stock: 18
Reorder Level: 20

Status:

LOW STOCK

19. Spare Parts Requisition

Create requisition:

Work Order

Truck

Mechanic

Part

Quantity

Reason

Prototype validation:

Parts cannot be released without an active Work Order.

Display confirmation modal:

Release Parts

Work Order: WO-00931

Part: Brake Pad

Quantity: 4

[Cancel] [Release Parts]

20. Drivers & HR

Driver management dashboard.

KPIs:

Total drivers

Available

On trip

Off duty

Suspended

Compliance issues

Driver table:

DriverIDLicenseStatusCurrent TripCompliance

21. Driver Profile

Driver profile should include:

Personal Information

Full name

Employee ID

Phone

Department

Date joined

Driving Information

License number

License category

Expiry date

Experience

Assigned truck

Compliance

Visual indicators:

Valid

Expiring Soon

Expired

22. Accounts & Expense Approvals

Accounts dashboard:

Pending approvals

Approved today

Rejected

Total disbursed

Expense variance

Expense table:

Expense IDTypeRequesterAmountTripStatusApproval

Types:

Toll

Allowance

Fuel

Repairs

Logistics

Other

23. Approval Workflow

Expense detail screen:

EXP-00481

Amount:

₦840,000

Show:

Requester

Trip

Expense category

Standard rate

Requested amount

Variance

Supporting documents

Approval history

Actions:

Approve

Reject

Request Clarification

The prototype should visually demonstrate multi-level approval.

24. Gate & Security

Gate dashboard should replace the traditional paper logbook.

KPIs:

Vehicles inside

Vehicles exited

Visitors

Assets moved

Pending gate actions

Gate Entry

Fields:

Vehicle

Driver

Purpose

Direction

Yard

Cargo

Reference

Security officer

Timestamp should be visually represented as:

12 Aug 2026 — 10:42:31

SERVER TIMESTAMP

25. Gate Activity

Table:

TimeAssetDriverDirectionPurposeOfficer

Filters:

Today

Incoming

Outgoing

Vehicle

Driver

Asset

26. Management God-View

This is the executive dashboard.

It should feel significantly more sophisticated than operational dashboards.

Executive Metrics

Revenue

Operating cost

Fleet utilization

Trips completed

Fuel cost

Maintenance cost

Expense exposure

Operational efficiency

27. Executive Charts

Prototype charts:

Fleet Utilization

Daily / Weekly / Monthly

Trip Performance

Completed vs Delayed

Fuel Efficiency

Actual vs Standard

Expense Breakdown

Fuel / Repairs / Tolls / Allowances

Operational Bottlenecks

Identify:

Delayed trips

Maintenance backlog

Pending approvals

Driver shortages

Low inventory

28. Messaging

Messaging should have three primary sections:

Direct Messages

Employee-to-employee communication.

Department Channels

Examples:

Operations

Engineering

Accounts

HR

Security

Trip Threads

Trip-specific conversations.

Example:

Trip #TRP-00842

29. Message Interface

Layout:

Left:

Conversation list

Center:

Chat

Right:

Context panel

Context panel displays:

Trip

Truck

Driver

Status

Route

Documents

This establishes contextual communication rather than generic chat.

30. Notifications

Notification center should categorize:

Operations

Trip status changed.

Approvals

New expense requires approval.

Compliance

Driver license expiring.

Engineering

Critical defect reported.

Security

Gate event recorded.

31. Reports

Reports module should provide enterprise reporting navigation.

Categories:

Fleet Reports

Fleet utilization

Vehicle status

Vehicle performance

Trip Reports

Trips completed

Delayed trips

Distance traveled

Fuel Reports

Consumption

Km/L

Fuel variance

Engineering Reports

Repairs

Maintenance cost

Downtime

HR Reports

Driver activity

Compliance

Availability

Accounts Reports

Expenses

Approvals

Operational spending

32. Audit Logs

The prototype must visually communicate that Karigo is an accountable enterprise system.

Audit log table:

TimestampUserModuleActionRecordIP/Device

Example:

12 Aug 2026 10:31

Admin User

Dispatch

Updated Trip

TRP-00842

Web

Actions should be presented as historical records rather than editable content.

33. Administration

Administration should contain:

Organization

Company profile

Logo

Contact information

Operating locations

Users

User management

Roles

Permissions

Roles

Example:

Super Admin

Executive

Operations Manager

Dispatcher

Fleet Manager

Engineer

Mechanic

Accountant

HR Manager

Security Officer

Driver

System Configuration

Fuel rates

Expense rates

Approval thresholds

Trip settings

Notification settings

34. Multi-Tenant UX

Even though the prototype initially represents Petroline Transport, the UI must be designed as SaaS.

Workspace header:

Petroline Transport

Workspace ID:

PTL-001

The interface should make it clear that another organization could eventually use the same platform.

Do not hard-code Petroline-specific assumptions into the overall UX architecture.

35. Global Search

The search interface should provide an enterprise command search experience.

Example search:

TRP-00842

Results:

Trip
Truck
Driver
Messages
Expenses
Audit Logs

Search results should be grouped by module.

36. Prototype Data

The prototype should contain realistic mock data.

Examples:

Trucks

Minimum 20–30 mock trucks.

Drivers

Minimum 30 mock drivers.

Trips

Minimum 50 mock trips.

Expenses

Minimum 30 transactions.

Inventory

Minimum 40 inventory items.

Work Orders

Minimum 25 work orders.

Notifications

Minimum 20 notifications.

Messages

Multiple conversations and trip threads.

The application should never look empty during demonstration.

37. Interactive Prototype Requirements

Although backend services are not connected, the frontend must behave realistically.

The following should work:

Sidebar navigation

Dashboard filtering

Search

Table sorting

Pagination

Modal windows

Create forms

Edit forms

View details

Status changes

Approval simulation

Notification interactions

Chat simulation

File/image upload simulation

Map interactions

Date filtering

Export buttons

Confirmation dialogs

Toast notifications

Breadcrumb navigation

Profile menus

38. Simulated Workflows

Workflow A — Create Trip

Dashboard → Dispatch → Create Dispatch → Select Truck → Select Driver → Enter Route → Calculate Mock Distance → Review → Create Trip → Trip Details.

Workflow B — Approve Expense

Accounts → Pending Approvals → Expense → Review → Approve → Confirmation → Updated Status.

Workflow C — Report Defect

Engineering → Defect Queue → New Defect → Upload Photo → Submit → New Work Order.

Workflow D — Release Spare Part

Inventory → Requisition → Work Order → Select Part → Quantity → Release → Inventory Updated.

Workflow E — Gate Entry

Gate → New Entry → Vehicle → Driver → Purpose → Submit → Entry appears in activity log.

Workflow F — Trip Communication

Trips → Active Trip → Trip Thread → Send Message → Message appears immediately.

39. Responsive Design

The web prototype must work across:

Desktop

Laptop

Tablet

Primary target:

1440px enterprise desktop

Secondary:

1280px

1024px

The layout must not collapse into an ordinary consumer-style mobile website.

The eventual Android application will have its own mobile UX.

40. Visual Design System

The prototype should establish a reusable design system.

Components

Buttons

Cards

Tables

Forms

Inputs

Selects

Date pickers

Tabs

Modals

Drawers

Dropdowns

Badges

Status indicators

Charts

Maps

Timelines

Toasts

Empty states

Loading states

Error states

41. Status System

Every operational state should have a consistent visual representation.

Examples:

ACTIVE

AVAILABLE

EN ROUTE

LOADED

OFFLOADING

RETURNING

COMPLETED

PENDING

APPROVED

REJECTED

MAINTENANCE

CRITICAL

EXPIRED

LOW STOCK

42. Enterprise UX Principles

The prototype must follow these principles:

1. Information Density

Enterprise users should be able to see significant operational information without excessive clicking.

2. Clear Hierarchy

Critical information must visually dominate secondary information.

3. Traceability

Important actions must show:

Who
What
When
Where
Reference ID

4. Exception First

The dashboard should emphasize problems requiring attention.

5. Minimal Friction

Frequent operational tasks should require as few steps as reasonably possible.

6. Consistency

The same interaction patterns should be used throughout the system.

43. Error & Empty States

The prototype must demonstrate professional handling of:

No data

Failed action

Missing information

Invalid form

Unauthorized action

Loading

Network unavailable

Sync pending

Example:

Connection Lost

Your latest changes have been saved locally.

Pending Sync: 3 records

44. Offline UX Preparation

Although offline functionality is not implemented in this frontend-only phase, the UI should be designed to accommodate it.

A global connectivity indicator should exist:

ONLINE

or

OFFLINE — 3 ITEMS PENDING SYNC

This will make later Android/offline development easier.

45. Role-Based Frontend Experience

The prototype should demonstrate different dashboards depending on role.

Executive

Primarily:

God View

Financial metrics

Bottlenecks

Approvals

Reports

Operations Manager

Primarily:

Dispatch

Fleet

Trips

Drivers

Live operations

Engineer

Primarily:

Defects

Work Orders

Inventory

Maintenance

Accountant

Primarily:

Expenses

Approvals

Financial reports

HR

Primarily:

Drivers

Compliance

Employee records

Security

Primarily:

Gate

Vehicle movement

Assets

Security logs

46. Prototype Security Presentation

The frontend should communicate enterprise security through:

Role-based menus

Permission indicators

Locked fields

Approval controls

Audit history

Session/profile controls

Security notifications

Confirmation dialogs for sensitive operations

These are visual representations at this stage, not production security implementations.

47. Marketing Landing Page

A separate public-facing landing page should be included in the prototype.

Sections:

Hero

The Digital Command Center for Modern Transport Operations

Subheading describing Karigo.

CTA:

Request a Demo

Secondary:

Explore Platform

Features

Fleet Management

Dispatch

Fuel Control

Engineering

HR

Accounts

Gate Security

Executive Intelligence

Enterprise Benefits

Eliminate manual processes

Improve accountability

Reduce operational leakage

Improve fleet utilization

Centralize operations

Product Preview

Show dashboard screenshots/mockups.

CTA

Bring Your Transport Operations Under Control

48. Authentication Screens

Prototype screens:

Login

Company/workspace

Email

Password

Remember me

Forgot password

Sign In

Forgot Password

Email

Reset Password

Workspace Selection

For future multi-tenant operation:

Select Workspace

Petroline Transport

Other available organizations

49. Prototype Navigation Map

PUBLIC WEBSITE
│
├── Landing Page
├── Features
├── About
├── Contact
└── Request Demo

AUTHENTICATION
│
├── Login
├── Forgot Password
└── Workspace Selection

APPLICATION
│
├── Dashboard
│
├── Fleet & Dispatch
│   ├── Fleet
│   ├── Dispatch
│   ├── Trips
│   └── Trip Details
│
├── Fuel
│   ├── Dashboard
│   ├── Requisitions
│   └── Consumption
│
├── Engineering
│   ├── Dashboard
│   ├── Defects
│   ├── Work Orders
│   └── Workshop
│
├── Inventory
│   ├── Stock
│   ├── Requisitions
│   └── Inventory Details
│
├── HR & Drivers
│   ├── Drivers
│   ├── Driver Details
│   └── Compliance
│
├── Accounts
│   ├── Dashboard
│   ├── Expenses
│   └── Approvals
│
├── Gate & Security
│   ├── Dashboard
│   ├── Entries
│   └── Gate Activity
│
├── Messages
│   ├── Direct
│   ├── Departments
│   └── Trip Threads
│
├── Reports
│
├── Notifications
│
├── Audit Logs
│
└── Administration
    ├── Organization
    ├── Users
    ├── Roles
    ├── Permissions
    └── System Settings


50. Prototype Acceptance Criteria

The frontend prototype will be considered successful when:

Navigation

Every primary module is accessible.

No dead-end navigation exists.

Breadcrumbs and back navigation work.

Visual Quality

Interface has consistent enterprise styling.

Dashboard looks production-ready.

Tables, cards, forms and charts share one design language.

Data

Screens contain realistic operational mock data.

No major screen appears empty.

Interaction

Primary workflows can be demonstrated end-to-end.

Buttons have meaningful actions.

Forms provide validation.

Modals and confirmations work.

Status changes are reflected visually.

Operations

A stakeholder should be able to demonstrate:

Creating a dispatch.

Assigning a driver.

Assigning a truck.

Viewing a trip.

Viewing trip progress.

Reviewing fuel requirements.

Creating a defect.

Opening a work order.

Requesting spare parts.

Approving an expense.

Recording gate activity.

Sending a message.

Viewing executive analytics.

Reviewing audit history.

51. Explicitly Out of Scope for This Phase

The following are not required to be production-functional in the frontend prototype:

Production database

Real authentication

Real multi-tenant database isolation

Paystack/payment integration

Google Maps API billing integration

Real Google Distance Matrix calculations

GPS tracking

External telematics

WebSockets

Firebase

Push notifications

Offline SQLite/Room database

Background synchronization

Production file storage

Production SMS

Production email

Play Store deployment

Production security infrastructure

These will be addressed during backend/mobile implementation.

52. Prototype Technology Direction

The frontend should be structured so that backend integration can occur without redesigning the interface.

Recommended architecture:

Frontend

React / Next.js

UI

Enterprise component system

State

Centralized frontend state management

Charts

Enterprise dashboard charting library

Maps

Map component prepared for Google Maps integration

Mock API

Local/mock service layer

Data Models

Interfaces/types matching the future backend schema

The exact technology stack can be finalized by the engineering team.

53. Future Backend Integration Principle

The prototype must not be built in a way that makes backend integration difficult.

Mock data should therefore follow the eventual entity structure:

Tenant
User
Role
Permission
Driver
Truck
Trip
Dispatch
FuelRequisition
Defect
WorkOrder
InventoryItem
InventoryRequisition
Expense
Approval
GateEntry
Message
Notification
AuditLog


This allows the frontend prototype to become the foundation of the actual production application.

54. BRD — Business Requirements

Business Problem

Heavy transport organizations commonly rely on fragmented spreadsheets, paper forms, phone calls, WhatsApp messages and manual approval processes.

This creates:

Poor visibility

Operational delays

Financial leakage

Weak accountability

Poor fleet utilization

Maintenance inefficiency

Fuel control problems

Compliance risk

Difficult auditing

Karigo is intended to centralize these processes into one controlled operational environment.

55. Business Objectives

Karigo should ultimately enable Petroline Transport to:

Centralize transport operations.

Improve fleet visibility.

Digitize dispatch.

Control fuel allocation.

Digitize maintenance.

Track spare parts.

Improve driver compliance.

Control operational expenses.

Digitize gate operations.

Improve management visibility.

Create a permanent audit trail.

Reduce operational leakage.

Improve communication between departments.

56. Key Business Stakeholders

Executive Management

Needs:

Business intelligence

Cost visibility

Operational bottlenecks

Approval oversight

Operations

Needs:

Fleet availability

Driver availability

Dispatch

Trip monitoring

Engineering

Needs:

Defect reports

Work orders

Spare parts

Maintenance history

HR

Needs:

Driver records

Compliance

Availability

Accounts

Needs:

Expense control

Approval workflow

Financial reporting

Security

Needs:

Vehicle movement

Asset tracking

Gate records

Drivers

Needs:

Trip information

Dispatch instructions

Defect reporting

Communication

57. Success Metrics

Future production metrics should include:

Fleet utilization rate

Average trip completion time

Fuel variance

Maintenance downtime

Expense approval turnaround

Driver compliance rate

Trip delay rate

Inventory stockout rate

Number of manual processes eliminated

Operational incidents

Audit compliance

58. Frontend Prototype Deliverables

The current phase should deliver:

1. Public Landing Page

2. Authentication UI

3. Enterprise Application Shell

4. Executive Dashboard

5. Fleet Dashboard

6. Dispatch Workflow

7. Trip Management

8. Fuel Management

9. Engineering

10. Inventory

11. Driver/HR

12. Accounts

13. Gate/Security

14. Messaging

15. Reports

16. Notifications

17. Audit Logs

18. Administration

19. Mock Data

20. Interactive Demonstration Workflows

59. Final Product Direction

The frontend prototype should not feel like an ordinary admin dashboard.

It should feel like:

A professional transport operations command center used by a major enterprise.

The key experience should be:

See → Understand → Decide → Act → Track → Audit

Every major Karigo workflow should reinforce that principle.

The frontend prototype therefore becomes the visual and interaction blueprint for the eventual:

Karigo Web Command Center + Karigo Android Field Application + Karigo SaaS Platform.

END OF FRONTEND PROTOTYPE PRD & BRDFor Karigo, considering that you want an enterprise-level frontend prototype now, but you also want to evolve that prototype into the actual production TMS later, I would not use a basic React/Vite setup alone.

My recommended stack

LayerRecommendationWhyFrameworkNext.js 16 + React 19Enterprise-ready, scalable, routing, server/client architectureLanguageTypeScriptCritical for a large system with many modules/entitiesUIshadcn/ui + Radix UIHighly customizable enterprise componentsStylingTailwind CSSFast development and consistent design systemIconsLucide ReactClean enterprise iconographyTablesTanStack TableExcellent for fleet, trips, expenses, inventory, HRFormsReact Hook Form + ZodStrong validation and complex enterprise formsStateZustandLightweight application state without unnecessary complexityServer dataTanStack QueryIdeal when the mock API is later replaced with the real backendChartsApache EChartsExcellent for the executive "God View"MapsGoogle Maps JavaScript APIMatches your PRDData gridAG GridWorth using for very large enterprise tablesDatesdate-fnsLightweight and reliableNotificationsSonnerClean toast/notification UXAnimationFramer Motion / MotionSubtle enterprise transitionsTestingVitest + PlaywrightUnit + end-to-end testingPackage managerpnpmFast and good for scalable projectsDeploymentVercel initially / AWS laterEasy prototype deployment, flexible production path

The architecture I'd use

                    KARIGO FRONTEND
                           │
                    Next.js + React
                           │
              ┌────────────┴────────────┐
              │                         │
         UI / Design                Application
              │                         │
     shadcn/ui + Tailwind        Zustand + TanStack
              │                    Query + Zod
              │                         │
              └────────────┬────────────┘
                           │
                    Service Layer
                           │
                  ┌────────┴────────┐
                  │                 │
              Mock API          Future API
                  │                 │
                  └────────┬────────┘
                           │
                    Karigo Backend
                           │
              ┌────────────┼────────────┐
              │            │            │
           Database      WebSocket    Storage
              │            │            │
           Tenants       Live Trips   Documents
           Users         Messaging    PODs
           Trips         Alerts       Defects


One important decision: Next.js

I would choose Next.js because Karigo isn't just a dashboard.

You have:

Public marketing website

Login

Tenant routing

Enterprise dashboard

Multiple modules

Reports

Administration

Role-based experiences

Future SaaS architecture

So you can have:

karigo.com.ng
      ↓
Marketing Website

app.karigo.com.ng
      ↓
Authentication
      ↓
Tenant Workspace
      ↓
Petroline Transport
      ↓
Dashboard


That gives you a much better foundation than building the prototype as a disconnected dashboard.

shadcn/ui + Tailwind is particularly good here

I would strongly recommend this combination.

You don't want Karigo to look like a generic template where every company using the template has the same UI.

With shadcn/ui, you can build your own Karigo design system:

KarigoButton
KarigoCard
KarigoTable
KarigoModal
KarigoStatusBadge
KarigoMetricCard
KarigoTimeline
KarigoCommandSearch
KarigoApprovalPanel
KarigoTripStatus
KarigoVehicleStatus


That becomes extremely useful once you have 15+ modules.

TanStack Table + AG Grid

I'd actually use both strategically.

Use TanStack Table for normal application tables:

Drivers

Trips

Notifications

Messages

Audit logs

Use AG Grid where users need serious enterprise data manipulation:

Fleet

Inventory

Expenses

Financial records

Large operational datasets

That gives you Excel-like functionality where it matters without making every table unnecessarily complicated.

ECharts for the "God View"

For your executive dashboard, I'd choose Apache ECharts.

You need things like:

Fleet Utilization
━━━━━━━━━━━━━━━━━━━━

Fuel Consumption
━━━━━━━━━━━━━━━━━━━━

Trip Performance
━━━━━━━━━━━━━━━━━━━━

Operating Cost
━━━━━━━━━━━━━━━━━━━━

Maintenance Cost
━━━━━━━━━━━━━━━━━━━━


And eventually:

drill-down

date ranges

comparison periods

dynamic filters

multiple dimensions

interactive tooltips

ECharts handles that very well.

What I would NOT do

I wouldn't build this with:

❌ Plain HTML/CSS/JS
❌ Bootstrap as the primary UI system
❌ jQuery
❌ A huge off-the-shelf admin template that becomes difficult to customize
❌ Redux everywhere
❌ Hard-coded mock JSON scattered throughout components
❌ Direct API calls inside every page
❌ Building each module independently without a shared design system

The biggest danger with a project like Karigo isn't whether you can make the screens.

It's ending up with 20 screens that look like they were built by 5 different developers.

The most important architectural decision

Even though you're asking for frontend prototype only, I'd build it as:

Prototype UI → Mock Service Layer → Future Real API

Not:

Prototype UI → hard-coded fake data

For example:

TripPage
   ↓
useTrip()
   ↓
tripService.getTrip()
   ↓
Mock API


Later:

TripPage
   ↓
useTrip()
   ↓
tripService.getTrip()
   ↓
Karigo Backend API


The page doesn't need to be rebuilt.

That is exactly what you want for a serious enterprise project.

My final recommendation

If I were CTO on this project, I'd lock the frontend stack as:

Next.js + React + TypeScript + Tailwind CSS + shadcn/ui + TanStack Query + TanStack Table + Zustand + React Hook Form + Zod + Apache ECharts + Google Maps + Playwright + pnpm

And I'd establish the Karigo Design System + Mock API architecture first, before building the individual modules.

That gives you a prototype that can realistically become the actual production frontend, rather than something that has to be thrown away after the client approves the design.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/1f0d22f8-be02-4c19-8baf-91a1f923e4ce).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
