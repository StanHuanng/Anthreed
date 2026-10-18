import { useMemo, useState } from 'react'
import { AnimatePresence, motion, type PanInfo, useMotionValue, useTransform } from 'framer-motion'
import type { Article } from '../lib/data'
import { sourceNames } from '../lib/data'

const spring = { type: 'spring' as const, stiffness: 420, damping: 36, mass: 0.85 }

type Props = {
  articles: Article[]
  dismissed: string[]
  onDismiss: (id: string) => void
  onOpen: (id: string) => void
}

function DeckCard({
  article,
  index,
  total,
  active,
  onDismiss,
  onOpen,
}: {
  article: Article
  index: number
  total: number
  active: boolean
  onDismiss: () => void
  onOpen: () => void
}) {
  const x = useMotionValue(0)
  const rotate = useTransform(x, [-220, 0, 220], [-14, 0, 14])
  const opacity = useTransform(x, [-220, -80, 0, 80, 220], [0.35, 1, 1, 1, 0.35])
  const [dragging, setDragging] = useState(false)

  const handleDragEnd = (_: unknown, info: PanInfo) => {
    setDragging(false)
    const should = Math.abs(info.offset.x) > 110 || Math.abs(info.velocity.x) > 700
    if (should) onDismiss()
  }

  const depth = Math.min(index, 2)
  const scale = 1 - depth * 0.045
  const y = depth * 14

  return (
    <motion.article
      className={`swipe-card ${active ? 'is-top' : ''}`}
      style={{
        x: active ? x : 0,
        rotate: active ? rotate : depth * -1.5,
        opacity: active ? opacity : 1,
        zIndex: total - index,
        scale,
        y,
      }}
      initial={{ opacity: 0, y: 28, scale: 0.96 }}
      animate={{ opacity: 1, y, scale }}
      exit={{ opacity: 0, x: x.get() || 180, rotate: rotate.get() || 12, transition: { duration: 0.28 } }}
      transition={spring}
      drag={active ? 'x' : false}
      dragConstraints={{ left: 0, right: 0 }}
      dragElastic={0.92}
      onDragStart={() => setDragging(true)}
      onDragEnd={handleDragEnd}
      onClick={() => { if (!dragging && active) onOpen() }}
      whileTap={active ? { scale: 0.985 } : undefined}
      layout
    >
      <div className="swipe-card-inner">
        <p className="swipe-card-source">{sourceNames[article.source] || article.source}</p>
        <h2 className="swipe-card-title">{article.title}</h2>
        <p className="swipe-card-author">{article.author || sourceNames[article.source] || '作者未提供'}</p>
        {active && <p className="swipe-card-hint">划走略过 · 点开细读</p>}
      </div>
    </motion.article>
  )
}

export function SwipeDeck({ articles, dismissed, onDismiss, onOpen }: Props) {
  const stack = useMemo(
    () => articles.filter(item => !dismissed.includes(item.id)),
    [articles, dismissed],
  )
  const visible = stack.slice(0, 3)

  if (!stack.length) {
    return (
      <div className="empty-state compact swipe-empty">
        <h2>这一叠读完了</h2>
        <p>换个来源，或等下一轮选稿。</p>
      </div>
    )
  }

  return (
    <div className="swipe-deck" aria-label="订阅卡片">
      <AnimatePresence mode="popLayout">
        {visible.map((article, index) => (
          <DeckCard
            key={article.id}
            article={article}
            index={index}
            total={visible.length}
            active={index === 0}
            onDismiss={() => onDismiss(article.id)}
            onOpen={() => onOpen(article.id)}
          />
        ))}
      </AnimatePresence>
      <p className="swipe-remaining">还剩 {stack.length} 篇</p>
    </div>
  )
}
